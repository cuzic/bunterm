/**
 * PersistentExecutor - Command execution in persistent shell sessions
 *
 * Uses OSC 633 shell integration to track command execution in a
 * persistent shell session. Provides:
 * - OSC 633 self-test on initialization
 * - Correlation ID tracking for API commands
 * - Command queue for serialization
 * - Session contamination detection
 */

import { type BlockStore, createBlockStore } from './block-store.js';
import type { TerminalSession } from './terminal-session.js';
import type {
  CommandRequest,
  CommandResponse,
  ExtendedBlock,
  GitInfo,
  IntegrationStatus,
  OutputChunk
} from './types.js';

/** Timeout for OSC 633 marker detection (ms) */
const MARKER_TIMEOUT_MS = 2000;

/** Default command timeout: 5 minutes */
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/** Event emitter callback types */
export type PersistentExecutorEventCallback = (event: PersistentExecutorEvent) => void;

export type PersistentExecutorEvent =
  | { type: 'started'; block: ExtendedBlock }
  | { type: 'output'; blockId: string; chunk: OutputChunk }
  | { type: 'completed'; block: ExtendedBlock }
  | { type: 'error'; blockId: string; error: string }
  | { type: 'integration_tested'; status: IntegrationStatus };

/**
 * Queued command waiting for execution
 */
interface QueuedCommand {
  request: CommandRequest;
  resolve: (response: CommandResponse) => void;
  reject: (error: Error) => void;
}

/**
 * Pending command being executed
 */
interface PendingCommand {
  blockId: string;
  correlationId: string;
  timeoutId: ReturnType<typeof setTimeout> | null;
  startedAt: number;
}

/**
 * PersistentExecutor wraps a TerminalSession for API command execution
 */
export class PersistentExecutor {
  private readonly session: TerminalSession;
  private readonly blockStore: BlockStore;
  private readonly sessionName: string;

  private integrationStatus: IntegrationStatus | null = null;
  private commandQueue: QueuedCommand[] = [];
  private pendingCommand: PendingCommand | null = null;
  private processing = false;

  private readonly eventListeners: Set<PersistentExecutorEventCallback> = new Set();

  // Track block output from OSC 633
  private currentBlockId: string | null = null;

  constructor(
    session: TerminalSession,
    blockStore?: BlockStore
  ) {
    this.session = session;
    this.sessionName = session.name;
    this.blockStore = blockStore ?? createBlockStore();
  }

  /**
   * Initialize the executor and test OSC 633 integration
   */
  async initialize(): Promise<IntegrationStatus> {
    this.integrationStatus = await this.testIntegration();
    this.emit({ type: 'integration_tested', status: this.integrationStatus });
    return this.integrationStatus;
  }

  /**
   * Test OSC 633 shell integration
   */
  private async testIntegration(): Promise<IntegrationStatus> {
    const testId = `__MARKER_TEST_${Date.now()}__`;
    const testCommand = `echo ${testId}`;

    return new Promise<IntegrationStatus>((resolve) => {
      let markerDetected = false;
      let shellType: IntegrationStatus['shellType'] = 'unknown';

      // Set up a timeout for marker detection
      const timeoutId = setTimeout(() => {
        if (!markerDetected) {
          resolve({
            osc633: false,
            shellType,
            testedAt: new Date().toISOString(),
            status: 'error',
            errorReason: 'OSC 633 marker not detected within timeout'
          });
        }
      }, MARKER_TIMEOUT_MS);

      // Hook into session output to detect markers
      const checkOutput = (data: string) => {
        // Check for OSC 633;D (command finished)
        if (data.includes('\x1b]633;D')) {
          markerDetected = true;
          clearTimeout(timeoutId);

          // Try to detect shell type from environment
          const shell = process.env['SHELL'] || '';
          if (shell.includes('zsh')) {
            shellType = 'zsh';
          } else if (shell.includes('bash')) {
            shellType = 'bash';
          } else if (shell.includes('fish')) {
            shellType = 'fish';
          }

          resolve({
            osc633: true,
            shellType,
            testedAt: new Date().toISOString(),
            status: 'healthy'
          });
        }
      };

      // Store original output handler and wrap it
      const originalWrite = this.session.write.bind(this.session);

      // Send test command
      originalWrite(`${testCommand}\n`);

      // Poll output buffer for a short time
      const pollInterval = setInterval(() => {
        // Check session's output buffer
        const buffer = this.session.getOutputBuffer();
        for (const item of buffer) {
          try {
            const decoded = Buffer.from(item, 'base64').toString('utf-8');
            checkOutput(decoded);
          } catch {
            // Ignore decode errors
          }
        }

        if (markerDetected) {
          clearInterval(pollInterval);
        }
      }, 100);

      // Clean up poll after timeout
      setTimeout(() => {
        clearInterval(pollInterval);
      }, MARKER_TIMEOUT_MS + 100);
    });
  }

  /**
   * Execute a command through the persistent session
   */
  async execute(request: CommandRequest): Promise<CommandResponse> {
    // Check integration status
    if (!this.integrationStatus) {
      await this.initialize();
    }

    if (!this.integrationStatus?.osc633) {
      throw new Error('OSC 633 integration not available. Use ephemeral mode instead.');
    }

    if (this.integrationStatus.status === 'contaminated') {
      throw new Error('Session is contaminated. Create a new session.');
    }

    return new Promise<CommandResponse>((resolve, reject) => {
      this.commandQueue.push({ request, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Process the command queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.pendingCommand || this.commandQueue.length === 0) {
      return;
    }

    this.processing = true;

    const queued = this.commandQueue.shift()!;
    const { request, resolve, reject } = queued;

    try {
      const response = await this.executeCommand(request);
      resolve(response);
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.processing = false;
      // Process next command
      this.processQueue();
    }
  }

  /**
   * Execute a single command
   */
  private async executeCommand(request: CommandRequest): Promise<CommandResponse> {
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    // Capture git info if requested
    let gitInfo: GitInfo | undefined;
    if (request.captureGitInfo !== false) {
      gitInfo = await this.captureGitInfo();
    }

    // Get current cwd from session
    const effectiveCwd = this.session.cwd;

    // Create block
    const block = this.blockStore.createBlock(this.sessionName, request.command, {
      mode: 'persistent',
      submittedVia: 'api',
      requestedCwd: request.cwd,
      requestedEnv: request.env,
      effectiveCwd,
      gitInfo,
      tags: request.tags,
      agentMeta: request.agentMeta
    });

    // Set up pending command state
    const pendingCommand: PendingCommand = {
      blockId: block.id,
      correlationId: block.correlationId!,
      timeoutId: null,
      startedAt: Date.now()
    };

    this.pendingCommand = pendingCommand;
    this.currentBlockId = block.id;

    // Set up timeout
    if (timeoutMs > 0) {
      pendingCommand.timeoutId = setTimeout(() => {
        this.handleTimeout(block.id);
      }, timeoutMs);
    }

    // If cwd was requested, change directory first
    if (request.cwd) {
      this.session.write(`cd ${this.escapeShellArg(request.cwd)} && `);
    }

    // If env was requested, prefix with env vars
    if (request.env && Object.keys(request.env).length > 0) {
      const envPrefix = Object.entries(request.env)
        .map(([k, v]) => `${k}=${this.escapeShellArg(v)}`)
        .join(' ');
      this.session.write(`${envPrefix} `);
    }

    // Send the command
    this.session.write(`${request.command}\n`);

    // Update status to running
    this.blockStore.updateStatus(block.id, 'running');
    block.status = 'running';

    this.emit({ type: 'started', block });

    // Wait for completion (detected via OSC 633;D)
    return new Promise<CommandResponse>((resolve) => {
      const checkCompletion = setInterval(() => {
        const currentBlock = this.blockStore.getBlock(block.id);
        if (currentBlock && currentBlock.status !== 'running' && currentBlock.status !== 'queued') {
          clearInterval(checkCompletion);
          this.cleanup(block.id);
          resolve({
            blockId: block.id,
            correlationId: block.correlationId!,
            status: currentBlock.status
          });
        }
      }, 100);

      // Also clear on timeout
      setTimeout(() => {
        clearInterval(checkCompletion);
        const currentBlock = this.blockStore.getBlock(block.id);
        if (currentBlock && (currentBlock.status === 'running' || currentBlock.status === 'queued')) {
          this.handleTimeout(block.id);
          resolve({
            blockId: block.id,
            correlationId: block.correlationId!,
            status: 'timeout'
          });
        }
      }, timeoutMs + 1000);
    });
  }

  /**
   * Handle command timeout
   */
  private handleTimeout(blockId: string): void {
    if (this.pendingCommand?.blockId !== blockId) return;

    // Send Ctrl+C to interrupt
    this.session.write('\x03');

    // Mark session as contaminated
    if (this.integrationStatus) {
      this.integrationStatus.status = 'contaminated';
    }

    // Complete block with timeout
    this.blockStore.completeBlock(blockId, -1, 'timeout');

    const block = this.blockStore.getBlock(blockId);
    if (block) {
      this.emit({ type: 'completed', block });
    }

    this.cleanup(blockId);
  }

  /**
   * Handle block completion from OSC 633
   */
  onBlockCompleted(blockId: string, exitCode: number): void {
    if (this.currentBlockId !== blockId) return;

    this.blockStore.completeBlock(
      blockId,
      exitCode,
      exitCode !== 0 ? 'nonzero' : undefined
    );

    const block = this.blockStore.getBlock(blockId);
    if (block) {
      this.emit({ type: 'completed', block });
    }

    this.cleanup(blockId);
  }

  /**
   * Handle block output from OSC 633
   */
  onBlockOutput(blockId: string, data: string): void {
    if (this.currentBlockId !== blockId) return;

    // For persistent mode, we treat all output as stdout
    const chunks = this.blockStore.appendOutput(blockId, 'stdout', data);

    for (const chunk of chunks) {
      this.emit({ type: 'output', blockId, chunk });
    }
  }

  /**
   * Clean up after command completion
   */
  private cleanup(blockId: string): void {
    if (this.pendingCommand?.blockId === blockId) {
      if (this.pendingCommand.timeoutId) {
        clearTimeout(this.pendingCommand.timeoutId);
      }
      this.pendingCommand = null;
    }

    if (this.currentBlockId === blockId) {
      this.currentBlockId = null;
    }
  }

  /**
   * Cancel the current command
   */
  cancelCommand(signal: 'SIGTERM' | 'SIGINT' | 'SIGKILL' = 'SIGINT'): boolean {
    if (!this.pendingCommand) return false;

    const blockId = this.pendingCommand.blockId;

    // Send appropriate signal
    if (signal === 'SIGINT') {
      this.session.write('\x03'); // Ctrl+C
    } else if (signal === 'SIGKILL') {
      this.session.write('\x03\x03\x03'); // Multiple Ctrl+C
    }

    // Mark session as contaminated
    if (this.integrationStatus) {
      this.integrationStatus.status = 'contaminated';
    }

    // Complete block
    this.blockStore.completeBlock(blockId, -1, 'canceled');

    const block = this.blockStore.getBlock(blockId);
    if (block) {
      this.emit({ type: 'completed', block });
    }

    this.cleanup(blockId);
    return true;
  }

  /**
   * Capture git info using the session
   */
  private async captureGitInfo(): Promise<GitInfo | undefined> {
    // For persistent mode, we can't easily capture git info
    // without sending commands. Return undefined for now.
    // This could be enhanced to use a side-channel or cached info.
    return undefined;
  }

  /**
   * Escape a shell argument
   */
  private escapeShellArg(arg: string): string {
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }

  /**
   * Add event listener
   */
  addEventListener(callback: PersistentExecutorEventCallback): void {
    this.eventListeners.add(callback);
  }

  /**
   * Remove event listener
   */
  removeEventListener(callback: PersistentExecutorEventCallback): void {
    this.eventListeners.delete(callback);
  }

  /**
   * Emit an event
   */
  private emit(event: PersistentExecutorEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('[PersistentExecutor] Event listener error:', error);
      }
    }
  }

  /**
   * Get the integration status
   */
  getIntegrationStatus(): IntegrationStatus | null {
    return this.integrationStatus;
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
  isRunning(): boolean {
    return this.pendingCommand !== null;
  }

  /**
   * Get the current block ID
   */
  getCurrentBlockId(): string | null {
    return this.currentBlockId;
  }

  /**
   * Get the block store
   */
  getBlockStore(): BlockStore {
    return this.blockStore;
  }

  /**
   * Get the session name
   */
  getSessionName(): string {
    return this.sessionName;
  }
}

/**
 * Create a PersistentExecutor
 */
export function createPersistentExecutor(
  session: TerminalSession,
  blockStore?: BlockStore
): PersistentExecutor {
  return new PersistentExecutor(session, blockStore);
}
