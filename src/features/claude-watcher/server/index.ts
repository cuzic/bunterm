/**
 * Claude Session Watcher Module
 *
 * Watches Claude Code session files and emits messages for real-time
 * integration with the terminal UI.
 */

export { ClaudeSessionWatcher } from './session-watcher.js';
export {
  parseHistoryEntry,
  parseSessionEntry,
  parseSessionLines,
  sessionEntryToMessages
} from './message-parser.js';
export {
  cwdToProjectPath,
  extractSessionId,
  getHistoryFilePath,
  getProjectDir,
  getProjectsDir,
  getSessionFilePath,
  isMatchingProject,
  projectPathToCwd
} from './path-utils.js';
export type {
  ClaudeAssistantContent,
  ClaudeAssistantTextWS,
  ClaudeHistoryEntry,
  ClaudeSessionEntry,
  ClaudeSessionStartWS,
  ClaudeSessionWatcherOptions,
  ClaudeTextBlock,
  ClaudeThinkingBlock,
  ClaudeThinkingWS,
  ClaudeToolResultBlock,
  ClaudeToolResultWS,
  ClaudeToolUseBlock,
  ClaudeToolUseWS,
  ClaudeUserMessage,
  ClaudeUserMessageWS,
  ClaudeWatcherMessage
} from './types.js';
export { CLAUDE_WATCHER_DEFAULTS } from './types.js';
