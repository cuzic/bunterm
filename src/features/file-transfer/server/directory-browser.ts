/**
 * Directory browser for session creation from portal
 */
// biome-ignore lint: type-only import, Dirent is only used as a type annotation
import type { Dirent } from 'node:fs';
import { existsSync, lstatSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DirectoryBrowserConfig } from '@/core/config/types.js';
import { isRelativePathSafe } from '@/utils/path-security.js';

export interface AllowedDirectory {
  path: string;
  name: string;
}

export interface DirectoryEntry {
  name: string;
  path: string;
}

export interface DirectoryListResult {
  current: string;
  directories: DirectoryEntry[];
}

/**
 * Expand tilde (~) to home directory
 */
export function expandTilde(path: string): string {
  if (path.startsWith('~/')) {
    return join(homedir(), path.slice(2));
  }
  if (path === '~') {
    return homedir();
  }
  return path;
}

/**
 * Contract home directory to tilde (~) for display
 */
export function contractTilde(path: string): string {
  const home = homedir();
  if (path === home) {
    return '~';
  }
  if (path.startsWith(`${home}/`)) {
    return `~${path.slice(home.length)}`;
  }
  return path;
}

export { isRelativePathSafe } from '@/utils/path-security.js';

/**
 * Get list of allowed base directories with their display names
 */
export function getAllowedDirectories(config: DirectoryBrowserConfig): AllowedDirectory[] {
  if (!config.enabled || !config.allowed_directories) {
    return [];
  }

  return config.allowed_directories
    .map((dir) => {
      const expanded = expandTilde(dir);
      if (!existsSync(expanded)) {
        return null;
      }
      try {
        const stat = statSync(expanded);
        if (!stat.isDirectory()) {
          return null;
        }
        return {
          path: expanded,
          name: contractTilde(expanded)
        };
      } catch {
        return null;
      }
    })
    .filter((d): d is AllowedDirectory => d !== null);
}

/**
 * Check if a resolved path is within any of the allowed base directories
 */
export function isWithinAllowedDirectories(
  resolvedPath: string,
  config: DirectoryBrowserConfig
): boolean {
  const allowedDirs = getAllowedDirectories(config);
  return allowedDirs.some((dir) => {
    const normalizedBase = resolve(dir.path);
    const normalizedPath = resolve(resolvedPath);
    return normalizedPath === normalizedBase || normalizedPath.startsWith(`${normalizedBase}/`);
  });
}

/**
 * Check if directory entry should be included in listing
 * Returns true if the entry is a valid directory that should be shown
 */
function shouldIncludeEntry(
  entry: Dirent,
  entryPath: string,
  config: DirectoryBrowserConfig
): boolean {
  const isDir = entry.isDirectory();
  const isSymlink = entry.isSymbolicLink();

  if (isSymlink) {
    return isValidSymlinkDirectory(entryPath, config);
  }

  return isDir;
}

/**
 * Check if a symlink points to a valid directory within allowed directories
 */
function isValidSymlinkDirectory(entryPath: string, config: DirectoryBrowserConfig): boolean {
  try {
    const realPath = realpathSync(entryPath);

    // Check symlink target is within allowed directories
    if (!isWithinAllowedDirectories(realPath, config)) {
      return false;
    }

    const linkStat = statSync(realPath);
    return linkStat.isDirectory();
  } catch {
    // Can't resolve symlink
    return false;
  }
}

/**
 * Check if an entry is accessible
 */
function isAccessible(entryPath: string): boolean {
  try {
    const entryStat = lstatSync(entryPath);
    return entryStat !== null;
  } catch {
    return false;
  }
}

/**
 * Validate the target directory for listing
 * Returns the resolved target path or null if invalid
 */
function validateTargetDirectory(
  allowedDirs: AllowedDirectory[],
  baseIndex: number,
  relativePath: string
): string | null {
  // Validate base index
  if (baseIndex < 0 || baseIndex >= allowedDirs.length) {
    return null;
  }

  // Validate relative path
  if (!isRelativePathSafe(relativePath)) {
    return null;
  }

  // Safe to cast: baseIndex bounds checked above
  const baseDir = (allowedDirs[baseIndex] as AllowedDirectory).path;
  const targetPath = relativePath ? join(baseDir, relativePath) : baseDir;
  const resolvedTarget = resolve(targetPath);

  // Check path is still within base directory
  if (!resolvedTarget.startsWith(resolve(baseDir))) {
    return null;
  }

  // Check target exists and is a directory
  if (!existsSync(resolvedTarget)) {
    return null;
  }

  try {
    const stat = statSync(resolvedTarget);
    if (!stat.isDirectory()) {
      return null;
    }
  } catch {
    return null;
  }

  return resolvedTarget;
}

/**
 * Collect directory entries from a resolved target path
 */
function collectDirectoryEntries(
  resolvedTarget: string,
  relativePath: string,
  config: DirectoryBrowserConfig
): DirectoryEntry[] | null {
  const directories: DirectoryEntry[] = [];

  try {
    const entries = readdirSync(resolvedTarget, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden files/directories
      if (entry.name.startsWith('.')) {
        continue;
      }

      const entryPath = join(resolvedTarget, entry.name);

      if (!shouldIncludeEntry(entry, entryPath, config)) {
        continue;
      }

      if (!isAccessible(entryPath)) {
        continue;
      }

      directories.push({
        name: entry.name,
        path: relativePath ? join(relativePath, entry.name) : entry.name
      });
    }
  } catch {
    // Can't read directory
    return null;
  }

  return directories;
}

/**
 * List subdirectories within an allowed base directory
 */
export function listSubdirectories(
  config: DirectoryBrowserConfig,
  baseIndex: number,
  relativePath: string
): DirectoryListResult | null {
  const allowedDirs = getAllowedDirectories(config);

  const resolvedTarget = validateTargetDirectory(allowedDirs, baseIndex, relativePath);
  if (!resolvedTarget) {
    return null;
  }

  const directories = collectDirectoryEntries(resolvedTarget, relativePath, config);
  if (!directories) {
    return null;
  }

  // Sort directories alphabetically (case-insensitive)
  directories.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

  return {
    current: resolvedTarget,
    directories
  };
}

/**
 * Validate that a full path is within allowed directories and exists
 */
export function validateDirectoryPath(config: DirectoryBrowserConfig, fullPath: string): boolean {
  if (!config.enabled) {
    return false;
  }

  const expanded = expandTilde(fullPath);
  const resolved = resolve(expanded);

  // Check if path exists and is a directory
  if (!existsSync(resolved)) {
    return false;
  }

  try {
    const stat = statSync(resolved);
    if (!stat.isDirectory()) {
      return false;
    }
  } catch {
    return false;
  }

  // Check if within allowed directories
  return isWithinAllowedDirectories(resolved, config);
}
