/**
 * EphemeralExecutor - Isolated command execution
 *
 * Runs commands in isolated bash processes with:
 * - Separate stdout/stderr capture
 * - Process group management for clean cancellation
 * - Timeout handling
 * - Git info capture
 * - Environment isolation
 */

import type { Subprocess } from 'bun';
import { type BlockStore, createBlockStore } from './block-store.js';
import type {
  CommandRequest,
  CommandResponse,
  ExtendedBlock,
  GitInfo,
  OutputChunk
} from './types.js';

/** Default timeout: 5 minutes */
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/** Event emitter callback types */
export type ExecutorEventCallback = (event: ExecutorEvent) => void;

export type ExecutorEvent =
  | { type: 'started'; block: ExtendedBlock }
  | { type: 'stdout'; blockId: string; chunk: OutputChunk }
  | { type: 'stderr'; blockId: string; chunk: OutputChunk }
  | { type: 'completed'; block: ExtendedBlock }
  | { type: 'error'; blockId: string; error: string };

/**
 * Running command state
 */
interface RunningCommand {
  blockId: string;
  process: Subprocess;
  timeoutId: ReturnType<typeof setTimeout> | null;
  aborted: boolean;
}

/**
 * EphemeralExecutor runs commands in isolated processes
 */
export class EphemeralExecutor {
  private readonly blockStore: BlockStore;
  private readonly sessionName: string;
  private readonly defaultCwd: string;
  private readonly runningCommands: Map<string, RunningCommand> = new Map();
  private readonly eventListeners: Set<ExecutorEventCallback> = new Set();

  constructor(sessionName: string, defaultCwd: string, blockStore?: BlockStore) {
    this.sessionName = sessionName;
    this.defaultCwd = defaultCwd;
    this.blockStore = blockStore ?? createBlockStore();
  }

  /**
   * Execute a command
   */
  async execute(request: CommandRequest): Promise<CommandResponse> {
    const cwd = request.cwd ?? this.defaultCwd;
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    // Capture git info if requested
    let gitInfo: GitInfo | undefined;
    if (request.captureGitInfo !== false) {
      gitInfo = await this.captureGitInfo(cwd);
    }

    // Create block
    const block = this.blockStore.createBlock(this.sessionName, request.command, {
      mode: 'ephemeral',
      submittedVia: 'api',
      requestedCwd: request.cwd,
      requestedEnv: request.env,
      effectiveCwd: cwd,
      gitInfo,
      tags: request.tags,
      agentMeta: request.agentMeta
    });

    // Update status to running
    this.blockStore.updateStatus(block.id, 'running');
    block.status = 'running';

    this.emit({ type: 'started', block });

    // Build environment
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ...request.env,
      // Prevent interactive prompts
      DEBIAN_FRONTEND: 'noninteractive',
      GIT_TERMINAL_PROMPT: '0'
    };

    // Spawn process with bash -lc for login shell behavior
    const proc = Bun.spawn(['bash', '-lc', request.command], {
      cwd,
      env,
      stdout: 'pipe',
      stderr: 'pipe'
    });

    // Set up timeout
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        this.cancelCommand(block.id, 'SIGTERM', 'timeout');
      }, timeoutMs);
    }

    // Track running command
    const running: RunningCommand = {
      blockId: block.id,
      process: proc,
      timeoutId,
      aborted: false
    };
    this.runningCommands.set(block.id, running);

    // Handle stdout
    this.streamOutput(block.id, proc.stdout, 'stdout');

    // Handle stderr
    this.streamOutput(block.id, proc.stderr, 'stderr');

    // Wait for process to complete
    const exitCode = await proc.exited;

    // Clear timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Remove from running commands
    this.runningCommands.delete(block.id);

    // Determine final status
    if (running.aborted) {
      // Already handled by cancelCommand
    } else {
      this.blockStore.completeBlock(block.id, exitCode, exitCode !== 0 ? 'nonzero' : undefined);
    }

    const finalBlock = this.blockStore.getBlock(block.id)!;
    this.emit({ type: 'completed', block: finalBlock });

    return {
      blockId: block.id,
      correlationId: block.correlationId!,
      status: finalBlock.status
    };
  }

  /**
   * Stream output from a readable stream to the block store
   */
  private async streamOutput(
    blockId: string,
    stream: ReadableStream<Uint8Array> | null,
    type: 'stdout' | 'stderr'
  ): Promise<void> {
    if (!stream) return;

    const reader = stream.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: false });

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const chunks = this.blockStore.appendOutput(blockId, type, text);

        // Emit events for each chunk
        for (const chunk of chunks) {
          this.emit({ type, blockId, chunk });
        }
      }
    } catch (error) {
      // Stream may be closed on process kill
      if (!String(error).includes('closed')) {
        console.error(`[EphemeralExecutor] Stream error for ${blockId}:`, error);
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Cancel a running command
   */
  cancelCommand(
    blockId: string,
    signal: 'SIGTERM' | 'SIGINT' | 'SIGKILL' = 'SIGTERM',
    reason: 'canceled' | 'timeout' = 'canceled'
  ): boolean {
    const running = this.runningCommands.get(blockId);
    if (!running) return false;

    running.aborted = true;

    // Clear timeout
    if (running.timeoutId) {
      clearTimeout(running.timeoutId);
      running.timeoutId = null;
    }

    // Kill the process
    try {
      running.process.kill(signal === 'SIGKILL' ? 9 : signal === 'SIGINT' ? 2 : 15);

      // If SIGTERM/SIGINT, schedule SIGKILL after 5 seconds
      if (signal !== 'SIGKILL') {
        setTimeout(() => {
          if (this.runningCommands.has(blockId)) {
            try {
              running.process.kill(9);
            } catch {
              // Process may already be dead
            }
          }
        }, 5000);
      }
    } catch {
      // Process may already be dead
    }

    // Update block status
    this.blockStore.completeBlock(blockId, -1, reason === 'timeout' ? 'timeout' : 'canceled');

    return true;
  }

  /**
   * Capture git repository information
   */
  private async captureGitInfo(cwd: string): Promise<GitInfo | undefined> {
    try {
      // Check if in git repo
      const isGitRepo = await this.runQuietCommand(cwd, 'git rev-parse --is-inside-work-tree');
      if (isGitRepo.trim() !== 'true') {
        return undefined;
      }

      // Get commit hash
      const head = (await this.runQuietCommand(cwd, 'git rev-parse HEAD')).trim();

      // Check for uncommitted changes
      const status = await this.runQuietCommand(cwd, 'git status --porcelain');
      const dirty = status.trim().length > 0;

      // Get repo root
      const repoRoot = (await this.runQuietCommand(cwd, 'git rev-parse --show-toplevel')).trim();

      return { head, dirty, repoRoot };
    } catch {
      return undefined;
    }
  }

  /**
   * Run a quiet command and return stdout
   */
  private async runQuietCommand(cwd: string, command: string): Promise<string> {
    const proc = Bun.spawn(['bash', '-c', command], {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe'
    });

    const output = await new Response(proc.stdout).text();
    await proc.exited;
    return output;
  }

  /**
   * Add event listener
   */
  addEventListener(callback: ExecutorEventCallback): void {
    this.eventListeners.add(callback);
  }

  /**
   * Remove event listener
   */
  removeEventListener(callback: ExecutorEventCallback): void {
    this.eventListeners.delete(callback);
  }

  /**
   * Emit an event
   */
  private emit(event: ExecutorEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('[EphemeralExecutor] Event listener error:', error);
      }
    }
  }

  /**
   * Get a block by ID
   */
  getBlock(blockId: string): ExtendedBlock | undefined {
    return this.blockStore.getBlock(blockId);
  }

  /**
   * Get all blocks for this session
   */
  getBlocks(): ExtendedBlock[] {
    return this.blockStore.getSessionBlocks(this.sessionName);
  }

  /**
   * Get chunks for a block
   */
  getBlockChunks(
    blockId: string,
    options?: { fromSeq?: number; stream?: 'stdout' | 'stderr' | 'all'; limit?: number }
  ): { chunks: OutputChunk[]; hasMore: boolean } {
    return this.blockStore.getBlockChunks(blockId, options);
  }

  /**
   * Check if a command is running
   */
  isRunning(blockId: string): boolean {
    return this.runningCommands.has(blockId);
  }

  /**
   * Get the block store
   */
  getBlockStore(): BlockStore {
    return this.blockStore;
  }

  /**
   * Clean up all running commands
   */
  async cleanup(): Promise<void> {
    for (const [blockId] of this.runningCommands) {
      this.cancelCommand(blockId, 'SIGKILL');
    }
  }
}

/**
 * Create an EphemeralExecutor
 */
export function createEphemeralExecutor(
  sessionName: string,
  defaultCwd: string,
  blockStore?: BlockStore
): EphemeralExecutor {
  return new EphemeralExecutor(sessionName, defaultCwd, blockStore);
}
