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
 * Summary of a Claude assistant response (for listing)
 */
export interface ClaudeTurnSummary {
  uuid: string;
  /** First 500 chars of assistant text response */
  assistantSummary: string;
  timestamp: string;
  hasToolUse: boolean;
  editedFiles?: string[];
}

/**
 * Full content of a Claude assistant response (for copying)
 */
export interface ClaudeTurnFull {
  uuid: string;
  /** Full assistant text content */
  assistantContent: string;
  timestamp: string;
  toolUses: Array<{
    name: string;
    input: Record<string, unknown>;
  }>;
}

// Re-export types from centralized services
export type { MarkdownFile } from '@/utils/markdown-scanner.js';
export type { GitDiffFile, GitDiffResponse } from '@/utils/git-service.js';
