/**
 * Claude Session Path Utilities
 *
 * Utilities for converting between working directories and
 * Claude Code project paths.
 */

import { CLAUDE_WATCHER_DEFAULTS } from './types.js';

/**
 * Convert working directory to Claude project path
 * @example "/home/cuzic/bunterm" → "-home-cuzic-bunterm"
 */
export function cwdToProjectPath(cwd: string): string {
  // Replace all forward slashes with dashes
  // Leading slash becomes leading dash
  return cwd.replace(/\//g, '-');
}

/**
 * Convert Claude project path back to working directory
 * @example "-home-cuzic-bunterm" → "/home/cuzic/bunterm"
 */
export function projectPathToCwd(projectPath: string): string {
  // Replace all dashes with forward slashes
  // Leading dash becomes leading slash
  return projectPath.replace(/-/g, '/');
}

/**
 * Get the Claude projects directory path
 * @example "/home/cuzic/.claude/projects"
 */
export function getProjectsDir(claudeDir: string = CLAUDE_WATCHER_DEFAULTS.claudeDir): string {
  return `${claudeDir}/projects`;
}

/**
 * Get the full path to a Claude project directory
 * @example "-home-cuzic-bunterm" → "/home/cuzic/.claude/projects/-home-cuzic-bunterm"
 */
export function getProjectDir(
  projectPath: string,
  claudeDir: string = CLAUDE_WATCHER_DEFAULTS.claudeDir
): string {
  return `${getProjectsDir(claudeDir)}/${projectPath}`;
}

/**
 * Get the full path to a Claude session file
 * @example getSessionFilePath("-home-cuzic-bunterm", "abc-123")
 *          → "/home/cuzic/.claude/projects/-home-cuzic-bunterm/abc-123.jsonl"
 */
export function getSessionFilePath(
  projectPath: string,
  sessionId: string,
  claudeDir: string = CLAUDE_WATCHER_DEFAULTS.claudeDir
): string {
  return `${getProjectDir(projectPath, claudeDir)}/${sessionId}.jsonl`;
}

/**
 * Get the path to Claude's history.jsonl file
 * @example "/home/cuzic/.claude/history.jsonl"
 */
export function getHistoryFilePath(claudeDir: string = CLAUDE_WATCHER_DEFAULTS.claudeDir): string {
  return `${claudeDir}/history.jsonl`;
}

/**
 * Check if a project path matches a working directory
 */
export function isMatchingProject(projectPath: string, cwd: string): boolean {
  return cwdToProjectPath(cwd) === projectPath;
}

/**
 * Extract session ID from a session file path
 * @example "/path/to/abc-123.jsonl" → "abc-123"
 */
export function extractSessionId(filePath: string): string | null {
  const match = filePath.match(/([a-f0-9-]+)\.jsonl$/i);
  return match?.[1] ?? null;
}
