/**
 * Shared Context Store
 *
 * Manages shared context, task coordination, and resource locking.
 */

import { EventEmitter } from 'node:events';
import type {
  ContextEntry,
  CreateTaskRequest,
  LockState,
  SetContextRequest,
  SwarmConfig,
  TaskFilter,
  TaskState,
  TaskStatus,
  UpdateTaskRequest
} from './types.js';

/**
 * Event types:
 * - 'context.set': (entry: ContextEntry)
 * - 'context.deleted': (key: string)
 * - 'task.created': (task: TaskState)
 * - 'task.claimed': (taskId: string, agentId: string)
 * - 'task.updated': (task: TaskState)
 * - 'task.completed': (task: TaskState)
 * - 'lock.acquired': (lock: LockState)
 * - 'lock.released': (resource: string, agentId: string)
 */
export class SharedContextStore extends EventEmitter {
  /** Shared context entries */
  private context: Map<string, ContextEntry> = new Map();
  /** Tasks */
  private tasks: Map<string, TaskState> = new Map();
  /** Resource locks */
  private locks: Map<string, LockState> = new Map();
  /** Configuration */
  private config: SwarmConfig;
  /** Cleanup timer */
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: SwarmConfig) {
    super();
    this.config = config;

    // Start cleanup timer for expired entries/locks
    if (config.enabled) {
      this.startCleanupTimer();
    }
  }

  // === Context Methods ===

  /**
   * Set a context entry
   */
  set(request: SetContextRequest): ContextEntry {
    const now = new Date().toISOString();
    const existing = this.context.get(request.key);

    const entry: ContextEntry = {
      key: request.key,
      value: request.value,
      setBy: request.agentId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ttlMs: request.ttlMs,
      expiresAt: request.ttlMs ? new Date(Date.now() + request.ttlMs).toISOString() : undefined
    };

    // Enforce max entries
    if (!existing && this.context.size >= this.config.context_max_entries) {
      // Remove oldest entry
      let oldest: ContextEntry | null = null;
      for (const e of this.context.values()) {
        if (!oldest || new Date(e.updatedAt).getTime() < new Date(oldest.updatedAt).getTime()) {
          oldest = e;
        }
      }
      if (oldest) {
        this.context.delete(oldest.key);
        this.emit('context.deleted', oldest.key);
      }
    }

    this.context.set(request.key, entry);
    this.emit('context.set', entry);

    return entry;
  }

  /**
   * Get a context entry
   */
  get(key: string): ContextEntry | null {
    const entry = this.context.get(key);
    if (!entry) {
      return null;
    }

    // Check expiration
    if (entry.expiresAt && new Date(entry.expiresAt).getTime() < Date.now()) {
      this.context.delete(key);
      this.emit('context.deleted', key);
      return null;
    }

    return entry;
  }

  /**
   * Delete a context entry
   */
  delete(key: string): boolean {
    if (!this.context.has(key)) {
      return false;
    }

    this.context.delete(key);
    this.emit('context.deleted', key);
    return true;
  }

  /**
   * List all context entries
   */
  listContext(): ContextEntry[] {
    const result: ContextEntry[] = [];
    const now = Date.now();

    for (const entry of this.context.values()) {
      if (entry.expiresAt && new Date(entry.expiresAt).getTime() < now) {
        this.context.delete(entry.key);
        this.emit('context.deleted', entry.key);
        continue;
      }
      result.push(entry);
    }

    return result;
  }

  // === Task Methods ===

  /**
   * Generate a unique task ID
   */
  private generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Create a new task
   */
  createTask(request: CreateTaskRequest): TaskState {
    const now = new Date().toISOString();
    const task: TaskState = {
      id: this.generateTaskId(),
      subject: request.subject,
      description: request.description,
      status: 'pending',
      assignedTo: request.assignedTo,
      createdBy: request.createdBy,
      blockedBy: request.blockedBy,
      blocks: [],
      priority: request.priority ?? 0,
      tags: request.tags,
      createdAt: now,
      updatedAt: now,
      metadata: request.metadata
    };

    this.tasks.set(task.id, task);
    this.emit('task.created', task);

    // Enforce history limit
    this.enforceTaskHistoryLimit();

    return task;
  }

  /**
   * Claim a task (assign to self)
   */
  claimTask(taskId: string, agentId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    // Can't claim if already assigned
    if (task.assignedTo && task.assignedTo !== agentId) {
      return false;
    }

    // Can't claim blocked tasks
    if (task.blockedBy && task.blockedBy.length > 0) {
      // Check if blocking tasks are completed
      const stillBlocked = task.blockedBy.some((bid) => {
        const blocker = this.tasks.get(bid);
        return blocker && blocker.status !== 'completed';
      });
      if (stillBlocked) {
        return false;
      }
    }

    task.assignedTo = agentId;
    task.status = 'in_progress';
    task.updatedAt = new Date().toISOString();

    this.emit('task.claimed', taskId, agentId);
    this.emit('task.updated', task);

    return true;
  }

  /**
   * Update a task
   */
  updateTask(taskId: string, updates: UpdateTaskRequest): TaskState | null {
    const task = this.tasks.get(taskId);
    if (!task) {
      return null;
    }

    const previousStatus = task.status;

    if (updates.subject !== undefined) {
      task.subject = updates.subject;
    }
    if (updates.description !== undefined) {
      task.description = updates.description;
    }
    if (updates.status !== undefined) {
      task.status = updates.status;
    }
    if (updates.assignedTo !== undefined) {
      task.assignedTo = updates.assignedTo;
    }
    if (updates.priority !== undefined) {
      task.priority = updates.priority;
    }
    if (updates.tags !== undefined) {
      task.tags = updates.tags;
    }
    if (updates.result !== undefined) {
      task.result = updates.result;
    }
    if (updates.metadata !== undefined) {
      task.metadata = { ...task.metadata, ...updates.metadata };
    }

    // Handle blockedBy updates
    if (updates.addBlockedBy) {
      task.blockedBy = [...(task.blockedBy ?? []), ...updates.addBlockedBy];
    }
    if (updates.removeBlockedBy) {
      task.blockedBy = (task.blockedBy ?? []).filter(
        (id) => !updates.removeBlockedBy!.includes(id)
      );
    }

    // Handle blocks updates
    if (updates.addBlocks) {
      task.blocks = [...(task.blocks ?? []), ...updates.addBlocks];
    }
    if (updates.removeBlocks) {
      task.blocks = (task.blocks ?? []).filter((id) => !updates.removeBlocks!.includes(id));
    }

    task.updatedAt = new Date().toISOString();

    // Handle completion
    if (task.status === 'completed' && previousStatus !== 'completed') {
      task.completedAt = new Date().toISOString();
      this.emit('task.completed', task);

      // Unblock dependent tasks
      if (task.blocks) {
        for (const blockedId of task.blocks) {
          const blocked = this.tasks.get(blockedId);
          if (blocked?.blockedBy) {
            blocked.blockedBy = blocked.blockedBy.filter((id) => id !== taskId);
            blocked.updatedAt = new Date().toISOString();
          }
        }
      }
    }

    this.emit('task.updated', task);
    return task;
  }

  /**
   * Get a task by ID
   */
  getTask(taskId: string): TaskState | null {
    return this.tasks.get(taskId) ?? null;
  }

  /**
   * List tasks with optional filter
   */
  listTasks(filter?: TaskFilter): TaskState[] {
    let tasks = Array.from(this.tasks.values());

    if (filter) {
      if (filter.status) {
        tasks = tasks.filter((t) => t.status === filter.status);
      }
      if (filter.assignedTo) {
        tasks = tasks.filter((t) => t.assignedTo === filter.assignedTo);
      }
      if (filter.createdBy) {
        tasks = tasks.filter((t) => t.createdBy === filter.createdBy);
      }
      if (filter.tag) {
        tasks = tasks.filter((t) => t.tags?.includes(filter.tag!));
      }
      if (filter.blockedByNone) {
        tasks = tasks.filter((t) => !t.blockedBy || t.blockedBy.length === 0);
      }
    }

    // Sort by priority (desc), then by creation date (asc)
    tasks.sort((a, b) => {
      const prioDiff = (b.priority ?? 0) - (a.priority ?? 0);
      if (prioDiff !== 0) return prioDiff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    return tasks;
  }

  /**
   * Get available tasks (pending, not blocked, not assigned)
   */
  getAvailableTasks(): TaskState[] {
    return this.listTasks({ status: 'pending', blockedByNone: true }).filter((t) => !t.assignedTo);
  }

  /**
   * Get task counts by status
   */
  getTaskCounts(): Record<TaskStatus, number> {
    const counts: Record<TaskStatus, number> = {
      pending: 0,
      in_progress: 0,
      completed: 0,
      blocked: 0,
      canceled: 0
    };

    for (const task of this.tasks.values()) {
      counts[task.status]++;
    }

    return counts;
  }

  /**
   * Enforce task history limit
   */
  private enforceTaskHistoryLimit(): void {
    const limit = this.config.task_history_limit;
    if (this.tasks.size <= limit) {
      return;
    }

    // Only remove completed tasks, oldest first
    const completed = Array.from(this.tasks.values())
      .filter((t) => t.status === 'completed')
      .sort((a, b) => new Date(a.completedAt!).getTime() - new Date(b.completedAt!).getTime());

    const toRemove = completed.slice(0, this.tasks.size - limit);
    for (const task of toRemove) {
      this.tasks.delete(task.id);
    }
  }

  // === Lock Methods ===

  /**
   * Acquire a lock on a resource
   */
  async acquireLock(resource: string, agentId: string, timeoutMs?: number): Promise<boolean> {
    const existing = this.locks.get(resource);
    const now = Date.now();

    // Check if existing lock is expired
    if (existing) {
      if (new Date(existing.expiresAt).getTime() > now) {
        // Lock is still valid
        return existing.heldBy === agentId; // True if we already hold it
      }
      // Lock expired, remove it
      this.locks.delete(resource);
      this.emit('lock.released', resource, existing.heldBy);
    }

    // Acquire the lock
    const timeout = timeoutMs ?? this.config.lock_default_timeout_ms;
    const lock: LockState = {
      resource,
      heldBy: agentId,
      acquiredAt: new Date().toISOString(),
      expiresAt: new Date(now + timeout).toISOString()
    };

    this.locks.set(resource, lock);
    this.emit('lock.acquired', lock);

    return true;
  }

  /**
   * Release a lock on a resource
   */
  releaseLock(resource: string, agentId: string): boolean {
    const lock = this.locks.get(resource);
    if (!lock) {
      return false;
    }

    // Only the holder can release
    if (lock.heldBy !== agentId) {
      return false;
    }

    this.locks.delete(resource);
    this.emit('lock.released', resource, agentId);

    return true;
  }

  /**
   * Check if a resource is locked
   */
  isLocked(resource: string): boolean {
    const lock = this.locks.get(resource);
    if (!lock) {
      return false;
    }

    // Check expiration
    if (new Date(lock.expiresAt).getTime() < Date.now()) {
      this.locks.delete(resource);
      this.emit('lock.released', resource, lock.heldBy);
      return false;
    }

    return true;
  }

  /**
   * Get lock info for a resource
   */
  getLock(resource: string): LockState | null {
    const lock = this.locks.get(resource);
    if (!lock) {
      return null;
    }

    // Check expiration
    if (new Date(lock.expiresAt).getTime() < Date.now()) {
      this.locks.delete(resource);
      this.emit('lock.released', resource, lock.heldBy);
      return null;
    }

    return lock;
  }

  /**
   * List all active locks
   */
  listLocks(): LockState[] {
    const result: LockState[] = [];
    const now = Date.now();

    for (const lock of this.locks.values()) {
      if (new Date(lock.expiresAt).getTime() > now) {
        result.push(lock);
      } else {
        this.locks.delete(lock.resource);
        this.emit('lock.released', lock.resource, lock.heldBy);
      }
    }

    return result;
  }

  /**
   * Release all locks held by an agent
   */
  releaseAllLocks(agentId: string): number {
    let count = 0;
    for (const [resource, lock] of this.locks.entries()) {
      if (lock.heldBy === agentId) {
        this.locks.delete(resource);
        this.emit('lock.released', resource, agentId);
        count++;
      }
    }
    return count;
  }

  // === Cleanup ===

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, 10000); // Every 10 seconds
  }

  /**
   * Clean up expired entries and locks
   */
  private cleanup(): void {
    const now = Date.now();

    // Clean up expired context entries
    for (const entry of this.context.values()) {
      if (entry.expiresAt && new Date(entry.expiresAt).getTime() < now) {
        this.context.delete(entry.key);
        this.emit('context.deleted', entry.key);
      }
    }

    // Clean up expired locks
    for (const lock of this.locks.values()) {
      if (new Date(lock.expiresAt).getTime() < now) {
        this.locks.delete(lock.resource);
        this.emit('lock.released', lock.resource, lock.heldBy);
      }
    }
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.context.clear();
    this.tasks.clear();
    this.locks.clear();
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clear();
    this.removeAllListeners();
  }

  /**
   * Export state for persistence
   */
  exportState(): {
    context: ContextEntry[];
    tasks: TaskState[];
    locks: LockState[];
  } {
    return {
      context: Array.from(this.context.values()),
      tasks: Array.from(this.tasks.values()),
      locks: Array.from(this.locks.values())
    };
  }

  /**
   * Import state from persistence
   */
  importState(state: {
    context?: ContextEntry[];
    tasks?: TaskState[];
    locks?: LockState[];
  }): void {
    if (state.context) {
      for (const entry of state.context) {
        this.context.set(entry.key, entry);
      }
    }
    if (state.tasks) {
      for (const task of state.tasks) {
        this.tasks.set(task.id, task);
      }
    }
    if (state.locks) {
      for (const lock of state.locks) {
        this.locks.set(lock.resource, lock);
      }
    }
  }
}
