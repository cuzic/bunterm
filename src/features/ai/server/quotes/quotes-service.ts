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
import {
  type CollectMdOptions,
  type MarkdownFile,
  collectMdFiles,
  getPlanFiles
} from '@/utils/markdown-scanner.js';
import { validateSecurePath } from '@/utils/path-security.js';
import { parseTurnByUuidFromSessionFile, parseTurnsFromSessionFile } from './parsing.js';
import type { ClaudeSessionInfo, ClaudeTurnFull, ClaudeTurnSummary } from './types.js';

// Re-export from centralized services for backward compatibility
export { getFileDiff, getGitDiff } from '@/utils/git-service.js';
export { collectMdFiles, getPlanFiles, type CollectMdOptions, type MarkdownFile };

// =============================================================================
// Markdown Collection Domain Functions
// =============================================================================

/** Default exclude directories for file scanning */
const DEFAULT_SCAN_EXCLUDE = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '__pycache__',
  '.venv',
  'vendor'
];

/** Config for project overview (shallow scan) */
const PROJECT_OVERVIEW_SCAN: CollectMdOptions = {
  excludeDirs: DEFAULT_SCAN_EXCLUDE,
  maxDepth: 3
};

/** Config for recent files (deep scan) */
const RECENT_FILES_SCAN: CollectMdOptions = {
  excludeDirs: DEFAULT_SCAN_EXCLUDE,
  maxDepth: 10
};

/**
 * Collect project markdown files (shallow scan for overview)
 */
export function collectProjectMarkdown(
  cwd: string,
  count: number
): { path: string; name: string; modifiedAt: string; size: number }[] {
  const allFiles = collectMdFiles(cwd, cwd, PROJECT_OVERVIEW_SCAN);
  return allFiles
    .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
    .slice(0, count);
}

/**
 * Collect recent markdown files (deep scan with time filter)
 */
export function collectRecentMarkdown(
  cwd: string,
  hours: number,
  count: number
): { path: string; name: string; modifiedAt: string; size: number }[] {
  const cutoffTime = Date.now() - hours * 60 * 60 * 1000;
  const allFiles = collectMdFiles(cwd, cwd, RECENT_FILES_SCAN);
  return allFiles
    .filter((f) => new Date(f.modifiedAt).getTime() > cutoffTime)
    .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
    .slice(0, count);
}

// =============================================================================
// File Content Source Resolution
// =============================================================================

/** File content source type */
export type FileContentSource = 'project' | 'plans';

/**
 * Resolve base directory for file content based on source
 *
 * @param source - 'plans' for ~/.claude/plans, 'project' for workspace
 * @param workspaceCwd - Required when source is 'project'
 * @returns Base directory path
 */
export function resolveFileContentBaseDir(
  source: FileContentSource,
  workspaceCwd?: string
): string {
  if (source === 'plans') {
    return join(homedir(), '.claude', 'plans');
  }
  if (!workspaceCwd) {
    throw new Error('workspaceCwd is required for project source');
  }
  return workspaceCwd;
}

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

/** Maximum file size to read (1MB) */
const MAX_FILE_SIZE = 1024 * 1024;

/** Maximum lines for preview mode */
const PREVIEW_MAX_LINES = 30;

/** Maximum lines for full content mode */
const FULL_CONTENT_MAX_LINES = 200;

/**
 * Check if a buffer contains binary content
 * Uses null byte detection as primary heuristic
 */
function isBinaryContent(buffer: Buffer): boolean {
  // Check first 8KB for null bytes (common in binary files)
  const checkSize = Math.min(buffer.length, 8192);
  for (let i = 0; i < checkSize; i++) {
    if (buffer[i] === 0) {
      return true;
    }
  }
  return false;
}

/**
 * Read file content with security validation and size limits
 *
 * ## Security Features
 * - Path traversal prevention (via validateSecurePath)
 * - File size limit (1MB max)
 * - Binary file detection
 * - Encoding error handling
 *
 * @param baseDir The base directory (project root or plans dir)
 * @param filePath The relative file path
 * @param isPreview Whether to limit lines (30 for preview, 200 for full)
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

  // Check file size before reading
  const fileStats = statSync(pathResult.targetPath);
  if (!fileStats.isFile()) {
    return { error: 'Not a file' };
  }
  if (fileStats.size > MAX_FILE_SIZE) {
    return { error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` };
  }

  // Read as buffer first for binary detection
  const buffer = readFileSync(pathResult.targetPath);
  if (isBinaryContent(buffer)) {
    return { error: 'Binary files not supported' };
  }

  // Convert to string (UTF-8)
  let fullContent: string;
  try {
    fullContent = buffer.toString('utf-8');
  } catch {
    return { error: 'Unable to read file (encoding error)' };
  }

  const lines = fullContent.split('\n');
  const maxLines = isPreview ? PREVIEW_MAX_LINES : FULL_CONTENT_MAX_LINES;
  const truncated = lines.length > maxLines;

  return {
    content: truncated ? lines.slice(0, maxLines).join('\n') : fullContent,
    truncated,
    totalLines: lines.length
  };
}

// === Repomix Operations ===

/**
 * Repomix result
 */
export interface RepomixResult {
  content: string;
  fileCount: number;
  tokenCount: number;
  directory: string;
}

/**
 * Run repomix on a directory and return the packed content
 * @param baseDir - Base directory (project root)
 * @param targetPath - Relative path to pack (e.g., "src/components")
 * @returns Packed content or error
 */
export async function runRepomix(
  baseDir: string,
  targetPath: string
): Promise<RepomixResult | { error: string }> {
  const pathResult = validateSecurePath(baseDir, targetPath);
  if (!pathResult.valid) {
    return { error: pathResult.error ?? 'Invalid path' };
  }

  const targetDir = pathResult.targetPath;
  if (!existsSync(targetDir)) {
    return { error: 'Directory not found' };
  }

  const stat = statSync(targetDir);
  if (!stat.isDirectory()) {
    return { error: 'Path is not a directory' };
  }

  try {
    // Run repomix with --stdout to get output directly
    const proc = Bun.spawn(
      [
        'npx',
        '-y',
        'repomix',
        '--stdout',
        '--style',
        'xml',
        '--output-show-line-numbers',
        '--include',
        `${targetPath}/**/*`
      ],
      {
        cwd: baseDir,
        stdout: 'pipe',
        stderr: 'pipe'
      }
    );

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text()
    ]);

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      return { error: `repomix failed: ${stderr || 'Unknown error'}` };
    }

    // Parse file count and token count from content
    // Look for patterns in the XML output
    const fileCountMatch = stdout.match(/(\d+)\s+files?/i);
    const tokenCountMatch = stdout.match(/(\d+)\s+tokens?/i);

    return {
      content: stdout,
      fileCount: fileCountMatch?.[1] ? Number.parseInt(fileCountMatch[1], 10) : 0,
      tokenCount: tokenCountMatch?.[1] ? Number.parseInt(tokenCountMatch[1], 10) : 0,
      directory: targetPath
    };
  } catch (error) {
    return { error: `Failed to run repomix: ${String(error)}` };
  }
}
