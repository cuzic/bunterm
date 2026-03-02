/**
 * AI Session Manager
 *
 * Manages AI chat sessions with:
 * - Idempotency for run requests
 * - Watchdog for stale runs
 * - Streaming support with ai_stream and ai_final
 */

import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { BlockSnapshot, RunnerName } from './types.js';

// === Types ===

export interface IdempotencyConfig {
  /** Maximum run duration in ms (default: 5 minutes) */
  maxRunDuration: number;
  /** TTL for completed entries in ms (default: 10 minutes) */
  completedTTL: number;
  /** Watchdog check interval in ms (default: 30 seconds) */
  watchdogInterval: number;
}

export const DEFAULT_IDEMPOTENCY_CONFIG: IdempotencyConfig = {
  maxRunDuration: 5 * 60 * 1000, // 5 minutes
  completedTTL: 10 * 60 * 1000, // 10 minutes
  watchdogInterval: 30 * 1000 // 30 seconds
};

export type AIRunStatus = 'pending' | 'running' | 'completed' | 'error' | 'timeout' | 'canceled';

export interface AIRunEntry {
  runId: string;
  idempotencyKey: string;
  status: AIRunStatus;
  startedAt: number;
  completedAt?: number;
  expiresAt: number;
  result?: AIRunResult;
  error?: string;
}

export interface AIRunResult {
  content: string;
  citations: Array<{ blockId: string; reason: string; excerpt?: string }>;
  nextCommands: Array<{ command: string; description: string; risk: string }>;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface ContextSnapshotConfig {
  /** Maximum number of blocks in snapshot (default: 10) */
  maxBlockCount: number;
  /** Maximum content size per block in bytes (default: 10KB) */
  maxContentPerBlock: number;
  /** Maximum total snapshot size in bytes (default: 100KB) */
  maxTotalSize: number;
}

export const DEFAULT_SNAPSHOT_CONFIG: ContextSnapshotConfig = {
  maxBlockCount: 10,
  maxContentPerBlock: 10 * 1024, // 10KB
  maxTotalSize: 100 * 1024 // 100KB
};

// === AI Stream Message Types ===

export interface AIStreamMessage {
  type: 'ai_stream';
  runId: string;
  seq: number;
  delta: string;
}

export interface AIFinalMessage {
  type: 'ai_final';
  runId: string;
  result: AIRunResult;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  elapsedMs: number;
}

export interface AIErrorMessage {
  type: 'ai_error';
  runId: string;
  error: string;
  code: 'timeout' | 'canceled' | 'runner_error' | 'unknown';
}

export type AIMessage = AIStreamMessage | AIFinalMessage | AIErrorMessage;

// === Idempotency Store ===

export class IdempotencyStore extends EventEmitter {
  private entries = new Map<string, AIRunEntry>();
  private runIdIndex = new Map<string, string>(); // runId -> idempotencyKey
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private readonly config: IdempotencyConfig;

  constructor(config: Partial<IdempotencyConfig> = {}) {
    super();
    this.config = { ...DEFAULT_IDEMPOTENCY_CONFIG, ...config };
    this.startWatchdog();
  }

  /**
   * Start the watchdog timer
   */
  private startWatchdog(): void {
    this.watchdogTimer = setInterval(() => {
      this.cleanupExpired();
      this.cancelStaleRuns();
    }, this.config.watchdogInterval);
  }

  /**
   * Cleanup expired entries
   */
  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt < now) {
        this.entries.delete(key);
        this.runIdIndex.delete(entry.runId);
      }
    }
  }

  /**
   * Cancel runs that have exceeded max duration
   */
  private cancelStaleRuns(): void {
    const now = Date.now();
    for (const [, entry] of this.entries) {
      if (entry.status === 'running' || entry.status === 'pending') {
        const elapsed = now - entry.startedAt;
        if (elapsed > this.config.maxRunDuration) {
          entry.status = 'timeout';
          entry.error = 'timeout_watchdog';
          entry.completedAt = now;
          entry.expiresAt = now + this.config.completedTTL;
          this.emit('run_timeout', entry.runId);
        }
      }
    }
  }

  /**
   * Check or create an entry for an idempotency key
   */
  getOrCreate(idempotencyKey: string): { entry: AIRunEntry; isNew: boolean } {
    const existing = this.entries.get(idempotencyKey);
    if (existing) {
      return { entry: existing, isNew: false };
    }

    const runId = `run_${randomUUID().slice(0, 8)}`;
    const now = Date.now();
    const entry: AIRunEntry = {
      runId,
      idempotencyKey,
      status: 'pending',
      startedAt: now,
      expiresAt: now + this.config.maxRunDuration + this.config.completedTTL
    };

    this.entries.set(idempotencyKey, entry);
    this.runIdIndex.set(runId, idempotencyKey);

    return { entry, isNew: true };
  }

  /**
   * Get entry by run ID
   */
  getByRunId(runId: string): AIRunEntry | null {
    const key = this.runIdIndex.get(runId);
    if (!key) return null;
    return this.entries.get(key) ?? null;
  }

  /**
   * Update entry status
   */
  updateStatus(runId: string, status: AIRunStatus, result?: AIRunResult, error?: string): void {
    const entry = this.getByRunId(runId);
    if (!entry) return;

    const now = Date.now();
    entry.status = status;

    if (
      status === 'completed' ||
      status === 'error' ||
      status === 'timeout' ||
      status === 'canceled'
    ) {
      entry.completedAt = now;
      entry.expiresAt = now + this.config.completedTTL;
    }

    if (result) {
      entry.result = result;
    }

    if (error) {
      entry.error = error;
    }
  }

  /**
   * Mark run as started
   */
  markRunning(runId: string): void {
    this.updateStatus(runId, 'running');
  }

  /**
   * Mark run as completed with result
   */
  markCompleted(runId: string, result: AIRunResult): void {
    this.updateStatus(runId, 'completed', result);
  }

  /**
   * Mark run as error
   */
  markError(runId: string, error: string): void {
    this.updateStatus(runId, 'error', undefined, error);
  }

  /**
   * Cancel a running entry
   */
  cancel(runId: string): boolean {
    const entry = this.getByRunId(runId);
    if (!entry) return false;

    if (entry.status === 'running' || entry.status === 'pending') {
      this.updateStatus(runId, 'canceled', undefined, 'user_canceled');
      this.emit('run_canceled', runId);
      return true;
    }

    return false;
  }

  /**
   * Get statistics
   */
  getStats(): {
    total: number;
    pending: number;
    running: number;
    completed: number;
    error: number;
    timeout: number;
    canceled: number;
  } {
    const stats = {
      total: this.entries.size,
      pending: 0,
      running: 0,
      completed: 0,
      error: 0,
      timeout: 0,
      canceled: 0
    };

    for (const entry of this.entries.values()) {
      stats[entry.status]++;
    }

    return stats;
  }

  /**
   * Dispose the store
   */
  dispose(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    this.entries.clear();
    this.runIdIndex.clear();
    this.removeAllListeners();
  }
}

// === Context Snapshot Helper ===

/**
 * Create a size-limited snapshot of blocks for AI context
 */
export function createContextSnapshot(
  blocks: Array<{
    id: string;
    command: string;
    output?: string;
    exitCode?: number;
    status: string;
  }>,
  config: ContextSnapshotConfig = DEFAULT_SNAPSHOT_CONFIG
): BlockSnapshot[] {
  // Take most recent N blocks
  const recent = blocks.slice(-config.maxBlockCount);

  let totalSize = 0;
  const snapshots: BlockSnapshot[] = [];

  for (const block of recent) {
    // Truncate output per block
    let outputPreview = block.output ?? '';
    if (outputPreview.length > config.maxContentPerBlock) {
      outputPreview = outputPreview.slice(-config.maxContentPerBlock);
    }

    // Check total size limit
    const entrySize = block.command.length + outputPreview.length;
    if (totalSize + entrySize > config.maxTotalSize) {
      break;
    }

    totalSize += entrySize;
    snapshots.push({
      id: block.id,
      command: block.command,
      outputPreview,
      exitCode: block.exitCode,
      status: block.status as 'running' | 'success' | 'error'
    });
  }

  return snapshots;
}

// === AI Session Manager ===

export interface AISession {
  id: string;
  sessionName: string;
  runner: RunnerName;
  createdAt: number;
  lastActivityAt: number;
  currentRunId: string | null;
  streamSeq: number;
}

export class AISessionManager {
  private sessions = new Map<string, AISession>();
  private idempotencyStore: IdempotencyStore;

  constructor(idempotencyConfig?: Partial<IdempotencyConfig>) {
    this.idempotencyStore = new IdempotencyStore(idempotencyConfig);

    // Forward events
    this.idempotencyStore.on('run_timeout', (runId) => {
      // Find session and clear current run
      for (const session of this.sessions.values()) {
        if (session.currentRunId === runId) {
          session.currentRunId = null;
          break;
        }
      }
    });
  }

  /**
   * Get or create a session
   */
  getOrCreateSession(sessionName: string, runner: RunnerName = 'auto'): AISession {
    const existing = this.sessions.get(sessionName);
    if (existing) {
      existing.lastActivityAt = Date.now();
      return existing;
    }

    const session: AISession = {
      id: `ai_session_${randomUUID().slice(0, 8)}`,
      sessionName,
      runner,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      currentRunId: null,
      streamSeq: 0
    };

    this.sessions.set(sessionName, session);
    return session;
  }

  /**
   * Get idempotency store
   */
  getIdempotencyStore(): IdempotencyStore {
    return this.idempotencyStore;
  }

  /**
   * Start a new AI run with idempotency
   */
  startRun(sessionName: string, idempotencyKey: string): { runId: string; isNew: boolean } {
    const session = this.getOrCreateSession(sessionName);
    const { entry, isNew } = this.idempotencyStore.getOrCreate(idempotencyKey);

    if (isNew) {
      session.currentRunId = entry.runId;
      session.streamSeq = 0;
      this.idempotencyStore.markRunning(entry.runId);
    }

    return { runId: entry.runId, isNew };
  }

  /**
   * Get next sequence number for streaming
   */
  getNextStreamSeq(sessionName: string): number {
    const session = this.sessions.get(sessionName);
    if (!session) return 0;
    return session.streamSeq++;
  }

  /**
   * Complete a run
   */
  completeRun(runId: string, result: AIRunResult): void {
    this.idempotencyStore.markCompleted(runId, result);

    // Clear current run from session
    for (const session of this.sessions.values()) {
      if (session.currentRunId === runId) {
        session.currentRunId = null;
        break;
      }
    }
  }

  /**
   * Mark run as error
   */
  errorRun(runId: string, error: string): void {
    this.idempotencyStore.markError(runId, error);

    // Clear current run from session
    for (const session of this.sessions.values()) {
      if (session.currentRunId === runId) {
        session.currentRunId = null;
        break;
      }
    }
  }

  /**
   * Cancel a run
   */
  cancelRun(runId: string): boolean {
    const canceled = this.idempotencyStore.cancel(runId);

    if (canceled) {
      // Clear current run from session
      for (const session of this.sessions.values()) {
        if (session.currentRunId === runId) {
          session.currentRunId = null;
          break;
        }
      }
    }

    return canceled;
  }

  /**
   * Get run by ID
   */
  getRun(runId: string): AIRunEntry | null {
    return this.idempotencyStore.getByRunId(runId);
  }

  /**
   * Get session
   */
  getSession(sessionName: string): AISession | null {
    return this.sessions.get(sessionName) ?? null;
  }

  /**
   * List all sessions
   */
  listSessions(): AISession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Remove a session
   */
  removeSession(sessionName: string): boolean {
    return this.sessions.delete(sessionName);
  }

  /**
   * Get statistics
   */
  getStats(): {
    sessions: number;
    idempotency: ReturnType<IdempotencyStore['getStats']>;
  } {
    return {
      sessions: this.sessions.size,
      idempotency: this.idempotencyStore.getStats()
    };
  }

  /**
   * Dispose the manager
   */
  dispose(): void {
    this.idempotencyStore.dispose();
    this.sessions.clear();
  }
}

// === Singleton Management ===

let aiSessionManagerInstance: AISessionManager | null = null;

/**
 * Get or create the AI session manager instance
 */
export function getAISessionManager(config?: Partial<IdempotencyConfig>): AISessionManager {
  if (!aiSessionManagerInstance) {
    aiSessionManagerInstance = new AISessionManager(config);
  }
  return aiSessionManagerInstance;
}

/**
 * Reset the AI session manager instance (for testing)
 */
export function resetAISessionManager(): void {
  if (aiSessionManagerInstance) {
    aiSessionManagerInstance.dispose();
    aiSessionManagerInstance = null;
  }
}
