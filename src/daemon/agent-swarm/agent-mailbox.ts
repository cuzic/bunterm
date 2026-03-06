/**
 * Agent Mailbox
 *
 * Handles message sending, receiving, and broadcasting between agents.
 */

import { EventEmitter } from 'node:events';
import type { AgentMessage, MessageFilter, SendMessageRequest, SwarmConfig } from './types.js';

/**
 * Event types:
 * - 'message.sent': (message: AgentMessage)
 * - 'message.broadcast': (message: AgentMessage)
 * - 'message.acknowledged': (messageId: string, agentId: string)
 */
export class AgentMailbox extends EventEmitter {
  /** All messages indexed by ID */
  private messages: Map<string, AgentMessage> = new Map();
  /** Inbox index: agentId -> messageIds */
  private inboxIndex: Map<string, string[]> = new Map();
  /** Broadcast messages */
  private broadcasts: string[] = [];
  /** Configuration */
  private config: SwarmConfig;

  constructor(config: SwarmConfig) {
    super();
    this.config = config;
  }

  /**
   * Generate a unique message ID
   */
  private generateId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Enforce message history limit
   */
  private enforceHistoryLimit(): void {
    const limit = this.config.message_history_limit;
    if (this.messages.size <= limit) {
      return;
    }

    // Sort messages by timestamp and remove oldest
    const sorted = Array.from(this.messages.values()).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const toRemove = sorted.slice(0, sorted.length - limit);
    for (const msg of toRemove) {
      this.messages.delete(msg.id);
      // Clean up inbox index
      if (msg.to !== '*') {
        const inbox = this.inboxIndex.get(msg.to);
        if (inbox) {
          const idx = inbox.indexOf(msg.id);
          if (idx !== -1) {
            inbox.splice(idx, 1);
          }
        }
      } else {
        const idx = this.broadcasts.indexOf(msg.id);
        if (idx !== -1) {
          this.broadcasts.splice(idx, 1);
        }
      }
    }
  }

  /**
   * Send a message to a specific agent or broadcast
   */
  send(request: SendMessageRequest): AgentMessage {
    const now = new Date().toISOString();
    const message: AgentMessage = {
      id: this.generateId(),
      type: request.type,
      from: request.from,
      to: request.to,
      payload: request.payload,
      replyTo: request.replyTo,
      timestamp: now,
      acknowledged: false
    };

    this.messages.set(message.id, message);

    if (message.to === '*') {
      // Broadcast message
      this.broadcasts.push(message.id);
      this.emit('message.broadcast', message);
    } else {
      // Direct message
      let inbox = this.inboxIndex.get(message.to);
      if (!inbox) {
        inbox = [];
        this.inboxIndex.set(message.to, inbox);
      }
      inbox.push(message.id);
      this.emit('message.sent', message);
    }

    this.enforceHistoryLimit();
    return message;
  }

  /**
   * Broadcast a message to all agents
   */
  broadcast(from: string, type: string, payload: unknown): AgentMessage {
    return this.send({
      from,
      to: '*',
      type,
      payload
    });
  }

  /**
   * Get messages for an agent (inbox + broadcasts)
   */
  getInbox(agentId: string, filter?: MessageFilter): AgentMessage[] {
    const messages: AgentMessage[] = [];

    // Get direct messages
    const directIds = this.inboxIndex.get(agentId) ?? [];
    for (const id of directIds) {
      const msg = this.messages.get(id);
      if (msg) {
        messages.push(msg);
      }
    }

    // Get broadcasts
    for (const id of this.broadcasts) {
      const msg = this.messages.get(id);
      if (msg && msg.from !== agentId) {
        // Don't include own broadcasts
        messages.push(msg);
      }
    }

    // Apply filters
    let result = messages;
    if (filter) {
      if (filter.type) {
        result = result.filter((m) => m.type === filter.type);
      }
      if (filter.from) {
        result = result.filter((m) => m.from === filter.from);
      }
      if (filter.acknowledged !== undefined) {
        result = result.filter((m) => m.acknowledged === filter.acknowledged);
      }
      if (filter.since) {
        const since = new Date(filter.since).getTime();
        result = result.filter((m) => new Date(m.timestamp).getTime() > since);
      }
    }

    // Sort by timestamp (newest first)
    result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return result;
  }

  /**
   * Get unacknowledged messages for an agent
   */
  getUnacknowledged(agentId: string): AgentMessage[] {
    return this.getInbox(agentId, { acknowledged: false });
  }

  /**
   * Acknowledge a message
   */
  acknowledge(agentId: string, messageId: string): boolean {
    const message = this.messages.get(messageId);
    if (!message) {
      return false;
    }

    // Only the recipient (or anyone for broadcasts) can acknowledge
    if (message.to !== '*' && message.to !== agentId) {
      return false;
    }

    if (message.acknowledged) {
      return true; // Already acknowledged
    }

    message.acknowledged = true;
    message.acknowledgedAt = new Date().toISOString();
    this.emit('message.acknowledged', messageId, agentId);

    return true;
  }

  /**
   * Acknowledge multiple messages
   */
  acknowledgeMany(agentId: string, messageIds: string[]): number {
    let count = 0;
    for (const id of messageIds) {
      if (this.acknowledge(agentId, id)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get a specific message by ID
   */
  get(messageId: string): AgentMessage | null {
    return this.messages.get(messageId) ?? null;
  }

  /**
   * Get messages in a thread (by replyTo chain)
   */
  getThread(messageId: string): AgentMessage[] {
    const thread: AgentMessage[] = [];
    const visitedInRootSearch = new Set<string>();

    // Find root message
    let current = this.messages.get(messageId);
    while (current && current.replyTo && !visitedInRootSearch.has(current.id)) {
      visitedInRootSearch.add(current.id);
      const parent = this.messages.get(current.replyTo);
      if (parent) {
        current = parent;
      } else {
        break;
      }
    }

    if (!current) {
      return [];
    }

    // Build thread from root
    const seen = new Set<string>();
    const queue = [current.id];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);

      const msg = this.messages.get(id);
      if (msg) {
        thread.push(msg);
        // Find replies
        for (const m of this.messages.values()) {
          if (m.replyTo === id && !seen.has(m.id)) {
            queue.push(m.id);
          }
        }
      }
    }

    // Sort by timestamp
    thread.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return thread;
  }

  /**
   * Get message counts
   */
  getCounts(): { total: number; unacknowledged: number } {
    let unacknowledged = 0;
    for (const msg of this.messages.values()) {
      if (!msg.acknowledged) {
        unacknowledged++;
      }
    }
    return {
      total: this.messages.size,
      unacknowledged
    };
  }

  /**
   * Clear all messages
   */
  clear(): void {
    this.messages.clear();
    this.inboxIndex.clear();
    this.broadcasts = [];
  }

  /**
   * Clear messages for a specific agent (when they unregister)
   */
  clearForAgent(agentId: string): void {
    this.inboxIndex.delete(agentId);
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    this.clear();
    this.removeAllListeners();
  }

  /**
   * Export all messages for state persistence
   */
  exportState(): AgentMessage[] {
    return Array.from(this.messages.values());
  }

  /**
   * Import messages from persisted state
   */
  importState(messages: AgentMessage[]): void {
    for (const msg of messages) {
      this.messages.set(msg.id, msg);
      if (msg.to === '*') {
        this.broadcasts.push(msg.id);
      } else {
        let inbox = this.inboxIndex.get(msg.to);
        if (!inbox) {
          inbox = [];
          this.inboxIndex.set(msg.to, inbox);
        }
        inbox.push(msg.id);
      }
    }
  }
}
