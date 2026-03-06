/**
 * Agent Swarm Service
 *
 * Main service that combines AgentRegistry, AgentMailbox, and SharedContextStore.
 */

import { EventEmitter } from 'node:events';
import { AgentMailbox } from './agent-mailbox.js';
import { AgentRegistry } from './agent-registry.js';
import { SharedContextStore } from './shared-context.js';
import type {
  AgentFilter,
  AgentInfo,
  AgentMessage,
  AgentStatus,
  ContextEntry,
  CreateTaskRequest,
  LockState,
  MessageFilter,
  RegisterAgentRequest,
  SendMessageRequest,
  SetContextRequest,
  SwarmConfig,
  SwarmEvent,
  SwarmEventType,
  SwarmStatusResponse,
  TaskFilter,
  TaskState,
  UpdateTaskRequest
} from './types.js';
import { DEFAULT_SWARM_CONFIG } from './types.js';

/**
 * Event types:
 * - 'event': (event: SwarmEvent)
 */
export class AgentSwarmService extends EventEmitter {
  private registry: AgentRegistry;
  private mailbox: AgentMailbox;
  private contextStore: SharedContextStore;
  private config: SwarmConfig;
  private eventSeq = 0;

  constructor(config?: Partial<SwarmConfig>) {
    super();
    this.config = { ...DEFAULT_SWARM_CONFIG, ...config };
    this.registry = new AgentRegistry(this.config);
    this.mailbox = new AgentMailbox(this.config);
    this.contextStore = new SharedContextStore(this.config);

    // Wire up internal events to unified event stream
    this.setupEventForwarding();
  }

  /**
   * Forward internal events to unified event stream
   */
  private setupEventForwarding(): void {
    // Registry events
    this.registry.on('agent.registered', (agent: AgentInfo) => {
      this.emitEvent('agent.registered', agent);
    });
    this.registry.on('agent.unregistered', (agentId: string) => {
      this.emitEvent('agent.unregistered', { agentId });
      // Clean up related data
      this.mailbox.clearForAgent(agentId);
      this.contextStore.releaseAllLocks(agentId);
    });
    this.registry.on('agent.status_changed', (agent: AgentInfo, previousStatus: AgentStatus) => {
      this.emitEvent('agent.status_changed', { agent, previousStatus });
    });

    // Mailbox events
    this.mailbox.on('message.sent', (message: AgentMessage) => {
      this.emitEvent('message.sent', message);
    });
    this.mailbox.on('message.broadcast', (message: AgentMessage) => {
      this.emitEvent('message.broadcast', message);
    });

    // Context events
    this.contextStore.on('context.set', (entry: ContextEntry) => {
      this.emitEvent('context.set', entry);
    });
    this.contextStore.on('context.deleted', (key: string) => {
      this.emitEvent('context.deleted', { key });
    });
    this.contextStore.on('task.created', (task: TaskState) => {
      this.emitEvent('task.created', task);
    });
    this.contextStore.on('task.claimed', (taskId: string, agentId: string) => {
      this.emitEvent('task.claimed', { taskId, agentId });
    });
    this.contextStore.on('task.updated', (task: TaskState) => {
      this.emitEvent('task.updated', task);
    });
    this.contextStore.on('task.completed', (task: TaskState) => {
      this.emitEvent('task.completed', task);
    });
    this.contextStore.on('lock.acquired', (lock: LockState) => {
      this.emitEvent('lock.acquired', lock);
    });
    this.contextStore.on('lock.released', (resource: string, agentId: string) => {
      this.emitEvent('lock.released', { resource, agentId });
    });
  }

  /**
   * Emit a swarm event
   */
  private emitEvent(type: SwarmEventType, data: unknown): void {
    const event: SwarmEvent = {
      seq: ++this.eventSeq,
      type,
      timestamp: new Date().toISOString(),
      data
    };
    this.emit('event', event);
  }

  // === Agent Methods ===

  registerAgent(request: RegisterAgentRequest): AgentInfo {
    return this.registry.register(request);
  }

  unregisterAgent(agentId: string): boolean {
    return this.registry.unregister(agentId);
  }

  heartbeat(agentId: string, status?: AgentStatus): boolean {
    return this.registry.heartbeat(agentId, status);
  }

  getAgent(agentId: string): AgentInfo | null {
    return this.registry.get(agentId);
  }

  listAgents(filter?: AgentFilter): AgentInfo[] {
    return this.registry.listAgents(filter);
  }

  findAgentsByCapability(capability: string): AgentInfo[] {
    return this.registry.findByCapability(capability);
  }

  // === Message Methods ===

  sendMessage(request: SendMessageRequest): AgentMessage {
    return this.mailbox.send(request);
  }

  broadcastMessage(from: string, type: string, payload: unknown): AgentMessage {
    return this.mailbox.broadcast(from, type, payload);
  }

  getInbox(agentId: string, filter?: MessageFilter): AgentMessage[] {
    return this.mailbox.getInbox(agentId, filter);
  }

  acknowledgeMessage(agentId: string, messageId: string): boolean {
    return this.mailbox.acknowledge(agentId, messageId);
  }

  getMessage(messageId: string): AgentMessage | null {
    return this.mailbox.get(messageId);
  }

  // === Context Methods ===

  setContext(request: SetContextRequest): ContextEntry {
    return this.contextStore.set(request);
  }

  getContext(key: string): ContextEntry | null {
    return this.contextStore.get(key);
  }

  deleteContext(key: string): boolean {
    return this.contextStore.delete(key);
  }

  listContext(): ContextEntry[] {
    return this.contextStore.listContext();
  }

  // === Task Methods ===

  createTask(request: CreateTaskRequest): TaskState {
    return this.contextStore.createTask(request);
  }

  claimTask(taskId: string, agentId: string): boolean {
    return this.contextStore.claimTask(taskId, agentId);
  }

  updateTask(taskId: string, updates: UpdateTaskRequest): TaskState | null {
    return this.contextStore.updateTask(taskId, updates);
  }

  getTask(taskId: string): TaskState | null {
    return this.contextStore.getTask(taskId);
  }

  listTasks(filter?: TaskFilter): TaskState[] {
    return this.contextStore.listTasks(filter);
  }

  getAvailableTasks(): TaskState[] {
    return this.contextStore.getAvailableTasks();
  }

  // === Lock Methods ===

  async acquireLock(resource: string, agentId: string, timeoutMs?: number): Promise<boolean> {
    return this.contextStore.acquireLock(resource, agentId, timeoutMs);
  }

  releaseLock(resource: string, agentId: string): boolean {
    return this.contextStore.releaseLock(resource, agentId);
  }

  isLocked(resource: string): boolean {
    return this.contextStore.isLocked(resource);
  }

  getLock(resource: string): LockState | null {
    return this.contextStore.getLock(resource);
  }

  listLocks(): LockState[] {
    return this.contextStore.listLocks();
  }

  // === Status ===

  getStatus(): SwarmStatusResponse {
    const taskCounts = this.contextStore.getTaskCounts();
    const messageCounts = this.mailbox.getCounts();

    return {
      agents: this.registry.listAgents(),
      tasks: {
        pending: taskCounts.pending,
        in_progress: taskCounts.in_progress,
        completed: taskCounts.completed,
        blocked: taskCounts.blocked
      },
      messages: messageCounts,
      locks: this.contextStore.listLocks()
    };
  }

  // === Lifecycle ===

  /**
   * Export all state for persistence
   */
  exportState(): {
    agents: AgentInfo[];
    messages: AgentMessage[];
    context: ContextEntry[];
    tasks: TaskState[];
    locks: LockState[];
  } {
    const contextState = this.contextStore.exportState();
    return {
      agents: this.registry.exportState(),
      messages: this.mailbox.exportState(),
      context: contextState.context,
      tasks: contextState.tasks,
      locks: contextState.locks
    };
  }

  /**
   * Import state from persistence
   */
  importState(state: {
    agents?: AgentInfo[];
    messages?: AgentMessage[];
    context?: ContextEntry[];
    tasks?: TaskState[];
    locks?: LockState[];
  }): void {
    if (state.agents) {
      this.registry.importState(state.agents);
    }
    if (state.messages) {
      this.mailbox.importState(state.messages);
    }
    this.contextStore.importState({
      context: state.context,
      tasks: state.tasks,
      locks: state.locks
    });
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.registry.clear();
    this.mailbox.clear();
    this.contextStore.clear();
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    this.registry.dispose();
    this.mailbox.dispose();
    this.contextStore.dispose();
    this.removeAllListeners();
  }
}
