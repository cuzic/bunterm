/**
 * Session Plugins - Interfaces for features injected into TerminalSession
 *
 * These interfaces decouple core/terminal from features/ modules,
 * following the DI pattern established in ADR 009.
 * Features implement these interfaces and are injected at the daemon layer.
 */

import type { Block } from '@/core/protocol/blocks.js';
import type {
  ChunkQueryResponse,
  ExtendedBlock,
  ExtendedBlockStatus,
  OutputChunk,
  ServerMessage
} from '@/core/protocol/index.js';

// === Block Manager ===

/** Block UI state management (implemented by features/blocks/server/block-model.ts) */
export interface BlockManager {
  readonly activeBlockId: string | null;
  readonly activeBlock: Block | null;
  readonly allBlocks: Block[];
  startBlock(command: string, startLine: number): Block;
  endBlock(blockId: string, exitCode: number, endLine: number): Block | null;
  appendOutput(blockId: string, data: string): void;
  setCwd(cwd: string): void;
  getBlock(blockId: string): Block | undefined;
  getRecentBlocks(count?: number): Block[];
}

// === Session Watcher ===

/** External session monitoring (implemented by features/claude-watcher) */
export interface SessionWatcher {
  start(): Promise<void>;
  stop(): void;
  on(event: 'message', listener: (msg: ServerMessage) => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
}

// === File Change Notifier ===

/**
 * File/directory change monitoring (implemented by features/file-watcher).
 * The onChange callback is invoked when a watched file or directory changes.
 */
export interface FileChangeNotifier {
  watchFile(relativePath: string): void;
  unwatchFile(relativePath: string): void;
  watchDir(relativePath: string): void;
  unwatchDir(relativePath: string): void;
  close(): void;
}

// === Executor Dependencies ===
// Interfaces for features/blocks dependencies used by command executors.
// Concrete implementations live in features/blocks/server/.

/** Block storage for command executors (implemented by features/blocks/server/block-store.ts) */
export interface ExecutorBlockStore {
  createBlock(
    sessionName: string,
    command: string,
    options?: Partial<ExtendedBlock>
  ): ExtendedBlock;
  updateStatus(blockId: string, status: ExtendedBlockStatus): void;
  completeBlock(blockId: string, exitCode: number, errorType?: ExtendedBlock['errorType']): void;
  appendOutput(blockId: string, stream: 'stdout' | 'stderr', data: string): OutputChunk[];
  getBlock(blockId: string): ExtendedBlock | undefined;
  getSessionBlocks(sessionName: string): ExtendedBlock[];
  getBlockChunks(
    blockId: string,
    options?: { fromSeq?: number; stream?: 'stdout' | 'stderr' | 'all'; limit?: number }
  ): ChunkQueryResponse;
  pinBlock(blockId: string): boolean;
  unpinBlock(blockId: string): boolean;
  clearSession(sessionName: string): void;
}

/** Block event emitter for SSE streaming (implemented by features/blocks/server/block-event-emitter.ts) */
export interface ExecutorBlockEventEmitter {
  emitStarted(block: ExtendedBlock): unknown;
  emitStdout(blockId: string, chunk: OutputChunk): unknown;
  emitStderr(blockId: string, chunk: OutputChunk): unknown;
  emitCompleted(block: ExtendedBlock): unknown;
  emitCanceled(blockId: string, signal: string): unknown;
}

// === Plugin Bundle ===

/** All plugins injected into TerminalSession */
export interface SessionPlugins {
  blockManager: BlockManager;
  sessionWatcher: SessionWatcher;
  fileChangeNotifier: FileChangeNotifier;
}

// === Null Object Implementations (feature disabled) ===

class NullBlockManager implements BlockManager {
  get activeBlockId(): null {
    return null;
  }
  get activeBlock(): null {
    return null;
  }
  get allBlocks(): Block[] {
    return [];
  }
  startBlock(_command: string, _startLine: number): Block {
    return {
      id: '',
      command: '',
      output: '',
      startedAt: '',
      cwd: '',
      status: 'running',
      startLine: 0
    };
  }
  endBlock(_blockId: string, _exitCode: number, _endLine: number): null {
    return null;
  }
  appendOutput(_blockId: string, _data: string): void {}
  setCwd(_cwd: string): void {}
  getBlock(_blockId: string): undefined {
    return undefined;
  }
  getRecentBlocks(_count?: number): Block[] {
    return [];
  }
}

class NullSessionWatcher implements SessionWatcher {
  async start(): Promise<void> {}
  stop(): void {}
  on(_event: string, _listener: (...args: any[]) => void): this {
    return this;
  }
}

class NullFileChangeNotifier implements FileChangeNotifier {
  watchFile(_relativePath: string): void {}
  unwatchFile(_relativePath: string): void {}
  watchDir(_relativePath: string): void {}
  unwatchDir(_relativePath: string): void {}
  close(): void {}
}

const nullBlockManager: BlockManager = new NullBlockManager();
const nullSessionWatcher: SessionWatcher = new NullSessionWatcher();
const nullFileChangeNotifier: FileChangeNotifier = new NullFileChangeNotifier();

export const nullPlugins: SessionPlugins = {
  blockManager: nullBlockManager,
  sessionWatcher: nullSessionWatcher,
  fileChangeNotifier: nullFileChangeNotifier
};
