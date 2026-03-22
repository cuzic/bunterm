/**
 * Claude Quotes Service
 *
 * Business logic for Claude quote operations.
 * Handles Claude session discovery, turn retrieval, and file operations.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { readJsonlFile } from '@/utils/jsonl.js';
import { validateSecurePath } from '@/utils/path-security.js';
import { parseTurnByUuidFromSessionFile, parseTurnsFromSessionFile } from './parsing.js';
import type { ClaudeSessionInfo, ClaudeTurnFull, ClaudeTurnSummary } from './types.js';

// Re-export from centralized services for backward compatibility
export { getFileDiff, getGitDiff } from '@/utils/git-service.js';
export { collectMdFiles, getPlanFiles } from '@/utils/markdown-scanner.js';

/**
 * History.jsonl entry structure
 */
interface HistoryEntry {
  sessionId?: string;
  project?: string;
  timestamp?: number;
  display?: string;
}

/**
 * File content result
 */
export interface FileContentResult {
  content: string;
  truncated: boolean;
  totalLines: number;
}

// === Claude Session Discovery ===

/**
 * Get recent Claude sessions from ~/.claude/history.jsonl
 */
export function getRecentClaudeSessions(limit = 10): ClaudeSessionInfo[] {
  const historyPath = join(homedir(), '.claude', 'history.jsonl');
  if (!existsSync(historyPath)) {
    return [];
  }

  const entries = readJsonlFile<HistoryEntry>(historyPath);

  // Group by sessionId, keeping most recent entry per session
  const sessionMap = new Map<string, ClaudeSessionInfo>();

  for (const entry of entries) {
    if (!entry.sessionId || !entry.project) {
      continue;
    }

    const existing = sessionMap.get(entry.sessionId);
    if (!existing || (entry.timestamp ?? 0) > existing.lastTimestamp) {
      sessionMap.set(entry.sessionId, {
        sessionId: entry.sessionId,
        projectPath: entry.project,
        projectName: basename(entry.project),
        lastMessage: entry.display?.slice(0, 100) || '',
        lastTimestamp: entry.timestamp ?? 0
      });
    }
  }

  return Array.from(sessionMap.values())
    .sort((a, b) => b.lastTimestamp - a.lastTimestamp)
    .slice(0, limit);
}

// === Session Path Resolution ===

/**
 * Convert project path to Claude slug
 */
function projectPathToSlug(projectPath: string): string {
  return projectPath.replace(/\//g, '-');
}

/**
 * Get Claude session file path from history.jsonl data
 */
function getClaudeSessionFilePath(projectPath: string, sessionId: string): string | null {
  const slug = projectPathToSlug(projectPath);
  const sessionFile = join(homedir(), '.claude', 'projects', slug, `${sessionId}.jsonl`);

  if (existsSync(sessionFile)) {
    return sessionFile;
  }

  return null;
}

/**
 * Find Claude project slug for a directory
 */
function findClaudeProjectSlug(projectDir: string): string | null {
  const claudeProjectsDir = join(homedir(), '.claude', 'projects');

  if (!existsSync(claudeProjectsDir)) {
    return null;
  }

  const normalizedDir = projectDir.replace(/\/+$/, '');
  const expectedSlug = normalizedDir.replace(/\//g, '-');

  if (existsSync(join(claudeProjectsDir, expectedSlug))) {
    return expectedSlug;
  }

  return null;
}

/**
 * Find most recent session file in a project directory
 */
function findRecentSessionFile(projectDir: string): string | null {
  const slug = findClaudeProjectSlug(projectDir);
  if (!slug) {
    return null;
  }

  const projectSlugDir = join(homedir(), '.claude', 'projects', slug);
  if (!existsSync(projectSlugDir)) {
    return null;
  }

  try {
    const files = readdirSync(projectSlugDir)
      .filter((f) => f.endsWith('.jsonl') && !f.startsWith('history'))
      .map((f) => ({
        name: f,
        path: join(projectSlugDir, f),
        mtime: statSync(join(projectSlugDir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.mtime - a.mtime);

    return files[0]?.path ?? null;
  } catch {
    return null;
  }
}

// === Turn Retrieval ===

/**
 * Get recent Claude turns (legacy approach using project directory)
 */
export async function getRecentClaudeTurns(
  projectDir: string,
  count: number
): Promise<ClaudeTurnSummary[]> {
  const sessionFile = findRecentSessionFile(projectDir);
  if (!sessionFile) {
    return [];
  }
  return parseTurnsFromSessionFile(sessionFile, count);
}

/**
 * Get recent Claude turns from specific session
 */
export async function getRecentClaudeTurnsFromSession(
  projectPath: string,
  sessionId: string,
  count: number
): Promise<ClaudeTurnSummary[]> {
  const sessionFile = getClaudeSessionFilePath(projectPath, sessionId);
  if (!sessionFile) {
    return [];
  }
  return parseTurnsFromSessionFile(sessionFile, count);
}

/**
 * Get full turn by UUID (legacy approach)
 */
export async function getClaudeTurnByUuid(
  projectDir: string,
  uuid: string
): Promise<ClaudeTurnFull | null> {
  const sessionFile = findRecentSessionFile(projectDir);
  if (!sessionFile) {
    return null;
  }
  return parseTurnByUuidFromSessionFile(sessionFile, uuid);
}

/**
 * Get full turn by UUID from specific session
 */
export async function getClaudeTurnByUuidFromSession(
  projectPath: string,
  sessionId: string,
  uuid: string
): Promise<ClaudeTurnFull | null> {
  const sessionFile = getClaudeSessionFilePath(projectPath, sessionId);
  if (!sessionFile) {
    return null;
  }
  return parseTurnByUuidFromSessionFile(sessionFile, uuid);
}

// === File Content Operations ===

/**
 * Read file content with optional truncation
 */
export function readFileContent(
  baseDir: string,
  filePath: string,
  isPreview: boolean
): FileContentResult | { error: string } {
  const pathResult = validateSecurePath(baseDir, filePath);
  if (!pathResult.valid) {
    return { error: pathResult.error ?? 'Invalid path' };
  }

  if (!existsSync(pathResult.targetPath)) {
    return { error: 'File not found' };
  }

  const fullContent = readFileSync(pathResult.targetPath, 'utf-8');
  const lines = fullContent.split('\n');
  // Use 30 lines for preview, 200 for full content
  const maxLines = isPreview ? 30 : 200;
  const truncated = lines.length > maxLines;

  return {
    content: truncated ? lines.slice(0, maxLines).join('\n') : fullContent,
    truncated,
    totalLines: lines.length
  };
}
