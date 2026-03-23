/**
 * CommandExecutorManager - Coordinates executors across sessions
 *
 * Manages:
 * - EphemeralExecutor instances per session
 * - PersistentExecutor instances per session
 * - Shared BlockStore and EventEmitter
 * - Unified API for command execution
 */

import type {
  CancelResponse,
  ChunkQueryResponse,
  CommandRequest,
  CommandResponse,
  ExtendedBlock,
  IntegrationStatus
} from '@/core/protocol/index.js';
import type { NativeSessionManager } from '@/core/server/session-manager.js';
import type { TerminalSession } from '@/core/terminal/session.js';
import { createEphemeralExecutor, type EphemeralExecutor } from './ephemeral-executor.js';
import { createPersistentExecutor, type PersistentExecutor } from './persistent-executor.js';
import type { ExecutorBlockEventEmitter, ExecutorBlockStore } from './session-plugins.js';

/**
 * Session executor state
 */
interface SessionExecutors {
  ephemeral: EphemeralExecutor;
  persistent?: PersistentExecutor;
}

/**
 * CommandExecutorManager coordinates command execution
 */
export class CommandExecutorManager {
  private readonly sessionManager: NativeSessionManager;
  private readonly blockStore: ExecutorBlockStore;
  private readonly eventEmitter: ExecutorBlockEventEmitter;
  private readonly executors: Map<string, SessionExecutors> = new Map();

  constructor(
    sessionManager: NativeSessionManager,
    deps: {
      blockStore: ExecutorBlockStore;
      eventEmitter: ExecutorBlockEventEmitter;
    }
  ) {
    this.sessionManager = sessionManager;
    this.blockStore = deps.blockStore;
    this.eventEmitter = deps.eventEmitter;
  }

  /**
   * Execute a command in a session
   */
  async executeCommand(sessionName: string, request: CommandRequest): Promise<CommandResponse> {
    const mode = request.mode ?? 'ephemeral';
    const executors = this.getOrCreateExecutors(sessionName);

    if (mode === 'ephemeral') {
      return this.executeEphemeral(executors.ephemeral, request);
    }
    // Ensure persistent executor exists
    if (!executors.persistent) {
      const session = this.sessionManager.getSession(sessionName);
      if (!session) {
        throw new Error(`Session ${sessionName} not found`);
      }
      executors.persistent = this.createPersistentExecutor(session);
    }
    return this.executePersistent(executors.persistent, request);
  }

  /**
   * Execute command in ephemeral mode
   */
  private async executeEphemeral(
    executor: EphemeralExecutor,
    request: CommandRequest
  ): Promise<CommandResponse> {
    // Hook up event emitter using lookup table
    const eventHandlers: Record<string, (event: any) => void> = {
      started: (e) => this.eventEmitter.emitStarted(e.block),
      stdout: (e) => this.eventEmitter.emitStdout(e.blockId, e.chunk),
      stderr: (e) => this.eventEmitter.emitStderr(e.blockId, e.chunk),
      completed: (e) => this.eventEmitter.emitCompleted(e.block)
    };
    const onEvent = (event: any) => eventHandlers[event.type]?.(event);

    // biome-ignore lint: server-side process lifetime listener
    executor.addEventListener(onEvent);
    try {
      return await executor.execute(request);
    } finally {
      executor.removeEventListener(onEvent);
    }
  }

  /**
   * Execute command in persistent mode
   */
  private async executePersistent(
    executor: PersistentExecutor,
    request: CommandRequest
  ): Promise<CommandResponse> {
    // Hook up event emitter using lookup table
    const eventHandlers: Record<string, (event: any) => void> = {
      started: (e) => this.eventEmitter.emitStarted(e.block),
      output: (e) => this.eventEmitter.emitStdout(e.blockId, e.chunk),
      completed: (e) => this.eventEmitter.emitCompleted(e.block)
    };
    const onEvent = (event: any) => eventHandlers[event.type]?.(event);

    // biome-ignore lint: server-side process lifetime listener
    executor.addEventListener(onEvent);
    try {
      return await executor.execute(request);
    } finally {
      executor.removeEventListener(onEvent);
    }
  }

  /**
   * Cancel a running command
   */
  cancelCommand(
    sessionName: string,
    blockId: string,
    signal: 'SIGTERM' | 'SIGINT' | 'SIGKILL' = 'SIGTERM'
  ): CancelResponse {
    const executors = this.executors.get(sessionName);
    if (!executors) {
      return {
        success: false,
        blockId,
        signal,
        sessionStatus: 'healthy'
      };
    }

    // Try ephemeral first
    if (executors.ephemeral.isRunning(blockId)) {
      const success = executors.ephemeral.cancelCommand(blockId, signal);
      if (success) {
        this.eventEmitter.emitCanceled(blockId, signal);
      }
      return {
        success,
        blockId,
        signal,
        sessionStatus: 'healthy' // Ephemeral doesn't contaminate
      };
    }

    // Try persistent
    if (executors.persistent?.currentBlock === blockId) {
      const success = executors.persistent.cancelCommand(signal);
      const status = executors.persistent.getIntegrationStatus();
      if (success) {
        this.eventEmitter.emitCanceled(blockId, signal);
      }
      // Map status to CancelResponse sessionStatus type
      const sessionStatus: 'healthy' | 'contaminated' =
        status?.status === 'contaminated' || status?.status === 'error'
          ? 'contaminated'
          : 'healthy';
      return {
        success,
        blockId,
        signal,
        sessionStatus
      };
    }

    return {
      success: false,
      blockId,
      signal,
      sessionStatus: 'healthy'
    };
  }

  /**
   * Get a block by ID
   */
  getBlock(blockId: string): ExtendedBlock | undefined {
    return this.blockStore.getBlock(blockId);
  }

  /**
   * Get all blocks for a session
   */
  getSessionBlocks(sessionName: string): ExtendedBlock[] {
    return this.blockStore.getSessionBlocks(sessionName);
  }

  /**
   * Get chunks for a block
   */
  getBlockChunks(
    blockId: string,
    options?: { fromSeq?: number; stream?: 'stdout' | 'stderr' | 'all'; limit?: number }
  ): ChunkQueryResponse {
    return this.blockStore.getBlockChunks(blockId, options);
  }

  /**
   * Get integration status for a session
   */
  getIntegrationStatus(sessionName: string): IntegrationStatus | null {
    const executors = this.executors.get(sessionName);
    return executors?.persistent?.getIntegrationStatus() ?? null;
  }

  /**
   * Pin a block
   */
  pinBlock(blockId: string): boolean {
    return this.blockStore.pinBlock(blockId);
  }

  /**
   * Unpin a block
   */
  unpinBlock(blockId: string): boolean {
    return this.blockStore.unpinBlock(blockId);
  }

  /**
   * Get the event emitter
   */
  getEventEmitter(): ExecutorBlockEventEmitter {
    return this.eventEmitter;
  }

  /**
   * Get the block store
   */
  getBlockStore(): ExecutorBlockStore {
    return this.blockStore;
  }

  /**
   * Get or create executors for a session
   */
  private getOrCreateExecutors(sessionName: string): SessionExecutors {
    let executors = this.executors.get(sessionName);
    if (!executors) {
      const session = this.sessionManager.getSession(sessionName);
      const cwd = session?.cwd ?? process.cwd();

      executors = {
        ephemeral: createEphemeralExecutor(sessionName, cwd, this.blockStore)
      };
      this.executors.set(sessionName, executors);
    }
    return executors;
  }

  /**
   * Create a persistent executor for a session
   */
  private createPersistentExecutor(session: TerminalSession): PersistentExecutor {
    return createPersistentExecutor(session, this.blockStore);
  }

  /**
   * Clean up executors for a session
   */
  async cleanupSession(sessionName: string): Promise<void> {
    const executors = this.executors.get(sessionName);
    if (executors) {
      await executors.ephemeral.cleanup();
      this.executors.delete(sessionName);
    }
    this.blockStore.clearSession(sessionName);
  }

  /**
   * Clean up all executors
   */
  async cleanup(): Promise<void> {
    for (const [sessionName] of this.executors) {
      await this.cleanupSession(sessionName);
    }
  }
}

/**
 * Create a CommandExecutorManager
 */
export function createCommandExecutorManager(
  sessionManager: NativeSessionManager,
  deps: {
    blockStore: ExecutorBlockStore;
    eventEmitter: ExecutorBlockEventEmitter;
  }
): CommandExecutorManager {
  return new CommandExecutorManager(sessionManager, deps);
}
