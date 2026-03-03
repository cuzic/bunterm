/**
 * Claude Quotes Types
 *
 * Shared type definitions for Claude session parsing and Quote to Clipboard feature.
 * Used by both server-side (http-handler.ts) and client-side (QuoteManager.ts).
 */

/**
 * Claude session info from ~/.claude/history.jsonl
 */
export interface ClaudeSessionInfo {
  sessionId: string;
  projectPath: string;
  projectName: string;
  lastMessage: string;
  lastTimestamp: number;
}

/**
 * Summary of a Claude conversation turn (for listing)
 */
export interface ClaudeTurnSummary {
  uuid: string;
  userContent: string;
  assistantSummary: string;
  timestamp: string;
  hasToolUse: boolean;
  editedFiles?: string[];
}

/**
 * Full content of a Claude conversation turn (for copying)
 */
export interface ClaudeTurnFull {
  uuid: string;
  userContent: string;
  assistantContent: string;
  timestamp: string;
  toolUses: Array<{
    name: string;
    input: Record<string, unknown>;
  }>;
}

/**
 * Markdown file info (for project markdown and plans)
 */
export interface MarkdownFile {
  path: string;
  relativePath?: string;
  name: string;
  modifiedAt: string;
  size: number;
}

/**
 * Git diff file entry
 */
export interface GitDiffFile {
  path: string;
  status: 'M' | 'A' | 'D' | 'R';
  additions: number;
  deletions: number;
}

/**
 * Git diff response
 */
export interface GitDiffResponse {
  files: GitDiffFile[];
  fullDiff: string;
  summary: string;
}
