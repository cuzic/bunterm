/**
 * CommandExecutorManager - Coordinates executors across sessions
 *
 * Manages:
 * - EphemeralExecutor instances per session
 * - PersistentExecutor instances per session
 * - Shared BlockStore and EventEmitter
 * - Unified API for command execution
 */

import { type BlockEventEmitter, createBlockEventEmitter } from './block-event-emitter.js';
import { type BlockStore, createBlockStore } from './block-store.js';
import { EphemeralExecutor, createEphemeralExecutor } from './ephemeral-executor.js';
import { type OutputRedactor, createRedactor } from './output-redactor.js';
import {
  PersistentExecutor,
  createPersistentExecutor
} from './persistent-executor.js';
import type { NativeSessionManager } from './session-manager.js';
import type { TerminalSession } from './terminal-session.js';
import type {
  CancelResponse,
  ChunkQueryResponse,
  CommandRequest,
  CommandResponse,
  ExtendedBlock,
  IntegrationStatus,
  RetentionPolicy
} from './types.js';

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
  private readonly blockStore: BlockStore;
  private readonly eventEmitter: BlockEventEmitter;
  private readonly redactor: OutputRedactor;
  private readonly executors: Map<string, SessionExecutors> = new Map();

  constructor(
    sessionManager: NativeSessionManager,
    options?: {
      retentionPolicy?: RetentionPolicy;
      redactionEnabled?: boolean;
    }
  ) {
    this.sessionManager = sessionManager;
    this.redactor = createRedactor({ enabled: options?.redactionEnabled ?? true });
    this.blockStore = createBlockStore(options?.retentionPolicy, this.redactor);
    this.eventEmitter = createBlockEventEmitter();
  }

  /**
   * Execute a command in a session
   */
  async executeCommand(
    sessionName: string,
    request: CommandRequest
  ): Promise<CommandResponse> {
    const mode = request.mode ?? 'ephemeral';
    const executors = this.getOrCreateExecutors(sessionName);

    if (mode === 'ephemeral') {
      return this.executeEphemeral(executors.ephemeral, request);
    } else {
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
  }

  /**
   * Execute command in ephemeral mode
   */
  private async executeEphemeral(
    executor: EphemeralExecutor,
    request: CommandRequest
  ): Promise<CommandResponse> {
    // Hook up event emitter
    const onEvent = (event: any) => {
      switch (event.type) {
        case 'started':
          this.eventEmitter.emitStarted(event.block);
          break;
        case 'stdout':
          this.eventEmitter.emitStdout(event.blockId, event.chunk);
          break;
        case 'stderr':
          this.eventEmitter.emitStderr(event.blockId, event.chunk);
          break;
        case 'completed':
          this.eventEmitter.emitCompleted(event.block);
          break;
      }
    };

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
    // Hook up event emitter
    const onEvent = (event: any) => {
      switch (event.type) {
        case 'started':
          this.eventEmitter.emitStarted(event.block);
          break;
        case 'output':
          this.eventEmitter.emitStdout(event.blockId, event.chunk);
          break;
        case 'completed':
          this.eventEmitter.emitCompleted(event.block);
          break;
      }
    };

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
    if (executors.persistent?.getCurrentBlockId() === blockId) {
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
  getEventEmitter(): BlockEventEmitter {
    return this.eventEmitter;
  }

  /**
   * Get the block store
   */
  getBlockStore(): BlockStore {
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
  options?: {
    retentionPolicy?: RetentionPolicy;
    redactionEnabled?: boolean;
  }
): CommandExecutorManager {
  return new CommandExecutorManager(sessionManager, options);
}
