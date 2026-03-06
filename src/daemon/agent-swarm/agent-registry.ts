/**
 * Agent Registry
 *
 * Manages agent registration, discovery, and heartbeat monitoring.
 */

import { EventEmitter } from 'node:events';
import type {
  AgentInfo,
  AgentFilter,
  AgentStatus,
  RegisterAgentRequest,
  SwarmConfig
} from './types.js';

/**
 * Event types:
 * - 'agent.registered': (agent: AgentInfo)
 * - 'agent.unregistered': (agentId: string)
 * - 'agent.status_changed': (agent: AgentInfo, previousStatus: AgentStatus)
 * - 'agent.timeout': (agentId: string)
 */
export class AgentRegistry extends EventEmitter {
  private agents: Map<string, AgentInfo> = new Map();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private config: SwarmConfig;

  constructor(config: SwarmConfig) {
    super();
    this.config = config;

    // Start heartbeat monitoring
    if (config.enabled) {
      this.startHeartbeatMonitor();
    }
  }

  /**
   * Generate a unique agent ID
   */
  private generateId(): string {
    return `agent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Register a new agent
   */
  register(request: RegisterAgentRequest): AgentInfo {
    // Check max agents limit
    if (this.agents.size >= this.config.max_agents) {
      throw new Error(`Maximum number of agents (${this.config.max_agents}) reached`);
    }

    const now = new Date().toISOString();
    const agent: AgentInfo = {
      id: this.generateId(),
      sessionName: request.sessionName,
      name: request.name,
      role: request.role,
      capabilities: request.capabilities ?? [],
      status: 'active',
      registeredAt: now,
      lastHeartbeat: now,
      metadata: request.metadata
    };

    this.agents.set(agent.id, agent);
    this.emit('agent.registered', agent);

    return agent;
  }

  /**
   * Unregister an agent
   */
  unregister(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return false;
    }

    this.agents.delete(agentId);
    this.emit('agent.unregistered', agentId);

    return true;
  }

  /**
   * Update agent heartbeat and optionally status
   */
  heartbeat(agentId: string, status?: AgentStatus): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return false;
    }

    const now = new Date().toISOString();
    const previousStatus = agent.status;
    agent.lastHeartbeat = now;

    if (status && status !== previousStatus) {
      agent.status = status;
      this.emit('agent.status_changed', agent, previousStatus);
    } else if (previousStatus === 'offline') {
      // Agent came back online
      agent.status = 'active';
      this.emit('agent.status_changed', agent, previousStatus);
    }

    return true;
  }

  /**
   * Update agent status
   */
  updateStatus(agentId: string, status: AgentStatus): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return false;
    }

    const previousStatus = agent.status;
    if (status !== previousStatus) {
      agent.status = status;
      this.emit('agent.status_changed', agent, previousStatus);
    }

    return true;
  }

  /**
   * Get a specific agent by ID
   */
  get(agentId: string): AgentInfo | null {
    return this.agents.get(agentId) ?? null;
  }

  /**
   * List all agents, optionally filtered
   */
  listAgents(filter?: AgentFilter): AgentInfo[] {
    let agents = Array.from(this.agents.values());

    if (filter) {
      if (filter.status) {
        agents = agents.filter((a) => a.status === filter.status);
      }
      if (filter.sessionName) {
        agents = agents.filter((a) => a.sessionName === filter.sessionName);
      }
      if (filter.name) {
        agents = agents.filter((a) => a.name === filter.name);
      }
      if (filter.capability) {
        agents = agents.filter((a) => a.capabilities.includes(filter.capability!));
      }
    }

    return agents;
  }

  /**
   * Find agents by capability
   */
  findByCapability(capability: string): AgentInfo[] {
    return this.listAgents({ capability });
  }

  /**
   * Find agents by session
   */
  findBySession(sessionName: string): AgentInfo[] {
    return this.listAgents({ sessionName });
  }

  /**
   * Get active agents (not offline)
   */
  getActiveAgents(): AgentInfo[] {
    return Array.from(this.agents.values()).filter((a) => a.status !== 'offline');
  }

  /**
   * Check if an agent is registered
   */
  has(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  /**
   * Get total agent count
   */
  get size(): number {
    return this.agents.size;
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeatMonitor(): void {
    // Check heartbeats every second
    this.heartbeatTimer = setInterval(() => {
      this.checkHeartbeats();
    }, 1000);
  }

  /**
   * Check for timed-out agents
   */
  private checkHeartbeats(): void {
    const now = Date.now();
    const timeout = this.config.heartbeat_timeout_ms;

    for (const agent of this.agents.values()) {
      const lastHeartbeat = new Date(agent.lastHeartbeat).getTime();
      const elapsed = now - lastHeartbeat;

      if (elapsed > timeout && agent.status !== 'offline') {
        const previousStatus = agent.status;
        agent.status = 'offline';
        this.emit('agent.status_changed', agent, previousStatus);
        this.emit('agent.timeout', agent.id);
      }
    }
  }

  /**
   * Clear all agents
   */
  clear(): void {
    for (const agentId of this.agents.keys()) {
      this.emit('agent.unregistered', agentId);
    }
    this.agents.clear();
  }

  /**
   * Stop heartbeat monitoring and cleanup
   */
  dispose(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.clear();
    this.removeAllListeners();
  }

  /**
   * Export all agents for state persistence
   */
  exportState(): AgentInfo[] {
    return Array.from(this.agents.values());
  }

  /**
   * Import agents from persisted state
   */
  importState(agents: AgentInfo[]): void {
    for (const agent of agents) {
      this.agents.set(agent.id, agent);
    }
  }
}
