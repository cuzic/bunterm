/**
 * Markdown Scanner
 *
 * Utilities for discovering and collecting markdown files from directories.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Markdown file info
 */
export interface MarkdownFile {
  path: string;
  relativePath?: string;
  name: string;
  modifiedAt: string;
  size: number;
}

/**
 * Options for collecting markdown files
 */
export interface CollectMdOptions {
  /** Directories to exclude (default: common build/dependency folders) */
  excludeDirs?: string[];
  /** Maximum directory depth (default: 5) */
  maxDepth?: number;
  /** Maximum number of files to collect (default: 100) */
  maxFiles?: number;
}

/**
 * Result of markdown file collection
 */
export interface CollectMdResult {
  files: MarkdownFile[];
  truncated: boolean;
  scannedDirs: number;
}

/** Default directories to exclude from markdown scanning */
const DEFAULT_EXCLUDE_DIRS = [
  'node_modules',
  'vendor',
  'dist',
  'build',
  '.git',
  '__pycache__',
  '.venv',
  'venv',
  'target',
  '.next',
  '.nuxt',
  'coverage'
];

/**
 * Internal state for scanning with limits
 */
interface ScanState {
  files: MarkdownFile[];
  dirsScanned: number;
  maxFiles: number;
}

/**
 * Collect markdown files from a directory recursively with limits
 */
function collectMdFilesInternal(
  dir: string,
  baseDir: string,
  excludeDirs: string[],
  maxDepth: number,
  currentDepth: number,
  state: ScanState
): void {
  if (currentDepth > maxDepth || state.files.length >= state.maxFiles) {
    return;
  }

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    state.dirsScanned++;

    for (const entry of entries) {
      if (state.files.length >= state.maxFiles) {
        return;
      }

      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!excludeDirs.includes(entry.name) && !entry.name.startsWith('.')) {
          collectMdFilesInternal(fullPath, baseDir, excludeDirs, maxDepth, currentDepth + 1, state);
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const stat = statSync(fullPath);
        const relativePath = fullPath.slice(baseDir.length + 1);
        state.files.push({
          path: relativePath,
          relativePath,
          name: entry.name,
          modifiedAt: stat.mtime.toISOString(),
          size: stat.size
        });
      }
    }
  } catch {
    // Skip directories we can't read
  }
}

/**
 * Collect markdown files from a directory recursively
 *
 * @param dir - Starting directory
 * @param baseDir - Base directory for relative paths
 * @param options - Collection options
 * @returns Array of markdown files (for backward compatibility)
 */
export function collectMdFiles(
  dir: string,
  baseDir: string,
  options: CollectMdOptions = {},
  currentDepth = 0
): MarkdownFile[] {
  const result = collectMdFilesWithResult(dir, baseDir, options, currentDepth);
  return result.files;
}

/**
 * Collect markdown files with result metadata
 *
 * @param dir - Starting directory
 * @param baseDir - Base directory for relative paths
 * @param options - Collection options
 * @returns Result with files and scan metadata
 */
export function collectMdFilesWithResult(
  dir: string,
  baseDir: string,
  options: CollectMdOptions = {},
  currentDepth = 0
): CollectMdResult {
  const {
    excludeDirs = DEFAULT_EXCLUDE_DIRS,
    maxDepth = 5,
    maxFiles = 100
  } = options;

  const state: ScanState = {
    files: [],
    dirsScanned: 0,
    maxFiles
  };

  collectMdFilesInternal(dir, baseDir, excludeDirs, maxDepth, currentDepth, state);

  return {
    files: state.files,
    truncated: state.files.length >= maxFiles,
    scannedDirs: state.dirsScanned
  };
}

/**
 * Get plan files from ~/.claude/plans
 */
export function getPlanFiles(count: number): MarkdownFile[] {
  const plansDir = join(homedir(), '.claude', 'plans');
  if (!existsSync(plansDir)) {
    return [];
  }

  return readdirSync(plansDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const fullPath = join(plansDir, f);
      const stat = statSync(fullPath);
      return { path: f, name: f, modifiedAt: stat.mtime.toISOString(), size: stat.size };
    })
    .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
    .slice(0, count);
}
