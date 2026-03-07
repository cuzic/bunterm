/**
 * Claude Session Watcher Types
 *
 * Type definitions for parsing Claude Code session files and
 * communicating with the browser client.
 */

// === Claude Code Session File Formats (Input) ===

/** history.jsonl entry */
export interface ClaudeHistoryEntry {
  display: string;
  pastedContents: Record<string, string>;
  timestamp: number;
  project: string; // e.g., "/home/cuzic/bunterm"
  sessionId?: string; // e.g., "4385c594-2e1f-4350-aef7-96ba9d44ba54"
}

/** {sessionId}.jsonl entry */
export interface ClaudeSessionEntry {
  type: 'user' | 'assistant';
  message: ClaudeUserMessage | ClaudeAssistantContent[];
  uuid: string;
  parentUuid: string | null;
  timestamp: string; // ISO 8601
  sessionId: string;
  cwd: string;
  version?: string;
  gitBranch?: string;
  slug?: string;
  isMeta?: boolean;
  isSidechain?: boolean;
  userType?: string;
}

/** User message content */
export interface ClaudeUserMessage {
  role: 'user';
  content: string;
}

/** Assistant message content block types */
export type ClaudeAssistantContent =
  | ClaudeTextBlock
  | ClaudeThinkingBlock
  | ClaudeToolUseBlock
  | ClaudeToolResultBlock;

/** Text content block */
export interface ClaudeTextBlock {
  type: 'text';
  text: string;
}

/** Thinking/reasoning block */
export interface ClaudeThinkingBlock {
  type: 'thinking';
  thinking: string;
  signature?: string;
}

/** Tool use block */
export interface ClaudeToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
  caller?: {
    type: string;
  };
}

/** Tool result block */
export interface ClaudeToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | ClaudeToolResultContent[];
  is_error?: boolean;
}

/** Tool result content (can be text or image) */
export interface ClaudeToolResultContent {
  type: 'text' | 'image';
  text?: string;
  source?: {
    type: string;
    media_type: string;
    data: string;
  };
}

// === WebSocket Messages (Output) ===

/** Claude user message */
export interface ClaudeUserMessageWS {
  type: 'claudeUserMessage';
  uuid: string;
  content: string;
  timestamp: string;
  sessionId: string;
}

/** Claude assistant text */
export interface ClaudeAssistantTextWS {
  type: 'claudeAssistantText';
  uuid: string;
  text: string;
  timestamp: string;
}

/** Claude thinking process */
export interface ClaudeThinkingWS {
  type: 'claudeThinking';
  uuid: string;
  thinking: string;
  timestamp: string;
}

/** Claude tool use */
export interface ClaudeToolUseWS {
  type: 'claudeToolUse';
  uuid: string;
  toolId: string;
  toolName: string;
  input: Record<string, unknown>;
  timestamp: string;
}

/** Claude tool result */
export interface ClaudeToolResultWS {
  type: 'claudeToolResult';
  uuid: string;
  toolId: string;
  content: string;
  isError: boolean;
  timestamp: string;
}

/** Claude session start */
export interface ClaudeSessionStartWS {
  type: 'claudeSessionStart';
  sessionId: string;
  project: string;
  slug?: string;
  timestamp: string;
}

/** Claude session end */
export interface ClaudeSessionEndWS {
  type: 'claudeSessionEnd';
  sessionId: string;
  timestamp: string;
}

/** All Claude watcher message types */
export type ClaudeWatcherMessage =
  | ClaudeUserMessageWS
  | ClaudeAssistantTextWS
  | ClaudeThinkingWS
  | ClaudeToolUseWS
  | ClaudeToolResultWS
  | ClaudeSessionStartWS
  | ClaudeSessionEndWS;

// === Configuration ===

/** Claude Session Watcher options */
export interface ClaudeSessionWatcherOptions {
  /** Terminal session's working directory */
  cwd: string;
  /** Claude config directory (default: ~/.claude) */
  claudeDir?: string;
  /** Include thinking blocks in output */
  includeThinking?: boolean;
  /** Maximum tool result content size before truncation */
  maxToolResultSize?: number;
}

/** Default configuration values */
export const CLAUDE_WATCHER_DEFAULTS = {
  claudeDir: `${process.env['HOME']}/.claude`,
  includeThinking: true,
  maxToolResultSize: 10000
} as const;
