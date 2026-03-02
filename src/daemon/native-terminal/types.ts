/**
 * Native Terminal WebSocket Protocol Types
 *
 * JSON-based protocol for communication between browser and server.
 * Unlike ttyd's binary protocol, this uses human-readable JSON for
 * easier debugging and extensibility.
 */

import type { ServerWebSocket } from 'bun';

// === Client → Server Messages ===

export interface InputMessage {
  type: 'input';
  /** Base64 encoded input data (supports mouse escape sequences with binary data) */
  data: string;
}

export interface ResizeMessage {
  type: 'resize';
  cols: number;
  rows: number;
}

export interface PingMessage {
  type: 'ping';
}

export type ClientMessage = InputMessage | ResizeMessage | PingMessage;

// === Server → Client Messages ===

export interface OutputMessage {
  type: 'output';
  /** Base64 encoded binary data (supports non-UTF-8 sequences) */
  data: string;
}

export interface TitleMessage {
  type: 'title';
  title: string;
}

export interface ExitMessage {
  type: 'exit';
  code: number;
}

export interface PongMessage {
  type: 'pong';
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export interface BellMessage {
  type: 'bell';
}

// === Block Types (for Warp-style block UI) ===

/** Basic block status for interactive UI */
export type BlockStatus = 'running' | 'success' | 'error';

/** Extended block status for Command Block API */
export type ExtendedBlockStatus =
  | 'queued'
  | 'running'
  | 'success'
  | 'error'
  | 'timeout'
  | 'canceled';

/** Execution mode for command execution */
export type ExecutionMode = 'ephemeral' | 'persistent';

/** How the command was submitted */
export type SubmissionSource = 'api' | 'interactive';

/** Error type classification */
export type BlockErrorType = 'nonzero' | 'timeout' | 'canceled' | 'marker_missing';

/** Git repository information captured at execution time */
export interface GitInfo {
  head: string; // Commit hash
  dirty: boolean; // Has uncommitted changes
  repoRoot: string; // Repository root path
}

/** Agent metadata for tracking */
export interface AgentMeta {
  agentId: string;
  contextId?: string;
  requestId?: string;
}

/** Basic block for interactive UI (original interface) */
export interface Block {
  id: string;
  command: string;
  output: string; // Base64 encoded terminal output
  startedAt: string;
  endedAt?: string;
  exitCode?: number;
  cwd?: string;
  status: BlockStatus;
  startLine: number; // Terminal row where block starts
  endLine?: number; // Terminal row where block ends
}

/** Extended block for Command Block API */
export interface ExtendedBlock {
  // Identification
  id: string;
  correlationId?: string;

  // Command information
  command: string;
  mode: ExecutionMode;
  submittedVia: SubmissionSource;

  // Environment (for reproducibility)
  requestedCwd?: string;
  requestedEnv?: Record<string, string>;
  effectiveCwd?: string;
  gitInfo?: GitInfo;

  // Output (preview only, full content in chunks)
  stdoutPreview: string; // First 500 characters
  stderrPreview: string;
  stdoutBytes: number;
  stderrBytes: number;
  truncated: boolean;

  // Status
  status: ExtendedBlockStatus;
  exitCode?: number;
  errorType?: BlockErrorType;

  // Timing
  startedAt: string;
  endedAt?: string;
  durationMs?: number;

  // Metadata
  tags?: string[];
  agentMeta?: AgentMeta;
  pinned?: boolean;

  // UI (for persistent mode)
  startLine?: number;
  endLine?: number;
}

/** Output chunk for streaming and storage */
export interface OutputChunk {
  id: string;
  blockId: string;
  stream: 'stdout' | 'stderr';
  seq: number; // Monotonically increasing sequence number
  content: string; // Base64 encoded
  timestamp: string;
}

/** Command execution request */
export interface CommandRequest {
  command: string;
  mode?: ExecutionMode; // default: 'ephemeral'
  cwd?: string;
  env?: Record<string, string>;
  tags?: string[];
  agentMeta?: AgentMeta;
  timeoutMs?: number; // default: 300000 (5 minutes)
  captureGitInfo?: boolean; // default: true
}

/** Command execution response */
export interface CommandResponse {
  blockId: string;
  correlationId: string;
  status: ExtendedBlockStatus;
}

/** OSC 633 shell integration status */
export interface IntegrationStatus {
  osc633: boolean;
  shellType?: 'bash' | 'zsh' | 'fish' | 'unknown';
  testedAt: string;
  status: 'healthy' | 'contaminated' | 'error';
  errorReason?: string;
}

/** Block retention policy configuration */
export interface RetentionPolicy {
  // Ring buffer
  maxRecentBlocks: number; // Default: 100, per session

  // Failed block retention
  maxFailedBlocks: number; // Default: 200
  failedRetentionDays: number; // Default: 30

  // Full output retention
  fullOutputRecentCount: number; // Default: 20
  olderBlocksPreviewOnly: boolean; // Default: true

  // Pinned blocks
  maxPinnedBlocks: number; // Default: 50
}

/** Default retention policy */
export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  maxRecentBlocks: 100,
  maxFailedBlocks: 200,
  failedRetentionDays: 30,
  fullOutputRecentCount: 20,
  olderBlocksPreviewOnly: true,
  maxPinnedBlocks: 50
};

/** Block cancel request */
export interface CancelRequest {
  signal?: 'SIGTERM' | 'SIGINT' | 'SIGKILL';
}

/** Block cancel response */
export interface CancelResponse {
  success: boolean;
  blockId: string;
  signal: string;
  sessionStatus: 'healthy' | 'contaminated';
}

/** Chunk query parameters */
export interface ChunkQueryParams {
  fromSeq?: number;
  stream?: 'stdout' | 'stderr' | 'all';
  limit?: number; // default: 100
}

/** Chunk query response */
export interface ChunkQueryResponse {
  chunks: OutputChunk[];
  hasMore: boolean;
}

/** SSE event types */
export type BlockEventType =
  | 'block.queued'
  | 'block.started'
  | 'block.stdout'
  | 'block.stderr'
  | 'block.completed'
  | 'block.canceled'
  | 'block.timeout';

/** SSE event data */
export interface BlockEvent {
  type: BlockEventType;
  blockId: string;
  seq: number;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface BlockSession {
  blocks: Block[];
  activeBlockId: string | null;
}

// === Block Messages (Server → Client) ===

export interface BlockStartMessage {
  type: 'blockStart';
  block: Block;
}

export interface BlockEndMessage {
  type: 'blockEnd';
  blockId: string;
  exitCode: number;
  endedAt: string;
  endLine: number;
}

export interface BlockOutputMessage {
  type: 'blockOutput';
  blockId: string;
  data: string; // Base64 encoded
}

export interface BlockListMessage {
  type: 'blockList';
  blocks: Block[];
}

// === AI Messages (Server → Client) ===

/** Citation in AI response */
export interface AICitation {
  blockId: string;
  reason: string;
  excerpt?: string;
}

/** Suggested command in AI response */
export interface AINextCommand {
  command: string;
  description: string;
  risk: 'safe' | 'caution' | 'dangerous';
}

/** AI stream message - incremental content (may be dropped, use ai_final for recovery) */
export interface AIStreamMessage {
  type: 'ai_stream';
  runId: string;
  seq: number;
  delta: string;
}

/** AI final message - contains full response (always sent, used for gap recovery) */
export interface AIFinalMessage {
  type: 'ai_final';
  runId: string;
  result: {
    content: string;
    citations: AICitation[];
    nextCommands: AINextCommand[];
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  elapsedMs: number;
}

/** AI error message */
export interface AIErrorMessage {
  type: 'ai_error';
  runId: string;
  error: string;
  code: 'timeout' | 'canceled' | 'runner_error' | 'rate_limited' | 'unknown';
}

/** AI run started message */
export interface AIRunStartedMessage {
  type: 'ai_run_started';
  runId: string;
  runner: string;
}

export type AIMessage = AIStreamMessage | AIFinalMessage | AIErrorMessage | AIRunStartedMessage;

// Re-export Claude Watcher types
export type {
  ClaudeAssistantTextWS,
  ClaudeSessionStartWS,
  ClaudeThinkingWS,
  ClaudeToolResultWS,
  ClaudeToolUseWS,
  ClaudeUserMessageWS,
  ClaudeWatcherMessage
} from './claude-watcher/types.js';

export type ServerMessage =
  | OutputMessage
  | TitleMessage
  | ExitMessage
  | PongMessage
  | ErrorMessage
  | BellMessage
  | BlockStartMessage
  | BlockEndMessage
  | BlockOutputMessage
  | BlockListMessage
  | AIStreamMessage
  | AIFinalMessage
  | AIErrorMessage
  | AIRunStartedMessage
  // Claude Watcher messages
  | import('./claude-watcher/types.js').ClaudeWatcherMessage;

// === Session Types ===

export interface TerminalSessionOptions {
  /** Session name */
  name: string;
  /** Command to run (e.g., ['tmux', 'attach', '-t', 'session']) */
  command: string[];
  /** Working directory */
  cwd: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Initial terminal columns */
  cols?: number;
  /** Initial terminal rows */
  rows?: number;
  /** Output buffer size for AI features (number of messages to keep) */
  outputBufferSize?: number;
}

export interface TerminalSessionInfo {
  name: string;
  pid: number;
  cwd: string;
  cols: number;
  rows: number;
  clientCount: number;
  startedAt: string;
}

// === WebSocket Handler Types ===

export interface NativeTerminalWebSocketData {
  sessionName: string;
}

export type NativeTerminalWebSocket = ServerWebSocket<NativeTerminalWebSocketData>;

// === Protocol Helpers ===

/**
 * Parse a client message from JSON string
 */
export function parseClientMessage(data: string): ClientMessage | null {
  try {
    const parsed = JSON.parse(data);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    switch (parsed.type) {
      case 'input':
        if (typeof parsed.data === 'string') {
          return { type: 'input', data: parsed.data };
        }
        break;
      case 'resize':
        if (
          typeof parsed.cols === 'number' &&
          typeof parsed.rows === 'number' &&
          parsed.cols > 0 &&
          parsed.rows > 0
        ) {
          return { type: 'resize', cols: parsed.cols, rows: parsed.rows };
        }
        break;
      case 'ping':
        return { type: 'ping' };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Serialize a server message to JSON string
 */
export function serializeServerMessage(message: ServerMessage): string {
  return JSON.stringify(message);
}

/**
 * Create an output message from raw PTY data
 */
export function createOutputMessage(data: Buffer | Uint8Array): OutputMessage {
  const base64 = Buffer.from(data).toString('base64');
  return { type: 'output', data: base64 };
}

/**
 * Create an error message
 */
export function createErrorMessage(message: string): ErrorMessage {
  return { type: 'error', message };
}

/**
 * Create an exit message
 */
export function createExitMessage(code: number): ExitMessage {
  return { type: 'exit', code };
}

/**
 * Create a title message
 */
export function createTitleMessage(title: string): TitleMessage {
  return { type: 'title', title };
}

/**
 * Create a pong message
 */
export function createPongMessage(): PongMessage {
  return { type: 'pong' };
}

/**
 * Create a bell message
 */
export function createBellMessage(): BellMessage {
  return { type: 'bell' };
}

/**
 * Create a block start message
 */
export function createBlockStartMessage(block: Block): BlockStartMessage {
  return { type: 'blockStart', block };
}

/**
 * Create a block end message
 */
export function createBlockEndMessage(
  blockId: string,
  exitCode: number,
  endedAt: string,
  endLine: number
): BlockEndMessage {
  return { type: 'blockEnd', blockId, exitCode, endedAt, endLine };
}

/**
 * Create a block output message
 */
export function createBlockOutputMessage(blockId: string, data: string): BlockOutputMessage {
  return { type: 'blockOutput', blockId, data };
}

/**
 * Create a block list message
 */
export function createBlockListMessage(blocks: Block[]): BlockListMessage {
  return { type: 'blockList', blocks };
}
