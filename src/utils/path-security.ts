/**
 * Path security utilities
 *
 * Provides secure path validation to prevent path traversal attacks.
 * Used by file-transfer and directory-browser modules.
 */

import { existsSync, realpathSync } from 'node:fs';
import { normalize, resolve } from 'node:path';
import { createLogger } from './logger.js';

const log = createLogger('path-security');

// =============================================================================
// Constants
// =============================================================================

/** Maximum allowed path length to prevent DoS */
export const MAX_PATH_LENGTH = 4096;

/** Regex for detecting URL-encoded path traversal (including double-encoding) */
export const URL_ENCODED_DOT_REGEX = /%2e|%252e/i;

/** Regex for detecting URL-encoded slashes (including double-encoding) */
export const URL_ENCODED_SLASH_REGEX = /%2f|%5c|%252f|%255c/i;

/** Windows drive letter pattern */
export const WINDOWS_DRIVE_REGEX = /^[a-zA-Z]:/;

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Check if a path contains dangerous patterns
 * This is a low-level check used by both isPathSafe and isRelativePathSafe
 */
export function containsDangerousPatterns(path: string): boolean {
  // Check for null bytes
  if (path.includes('\x00')) {
    return true;
  }

  // Check for Windows absolute paths (drive letters)
  if (WINDOWS_DRIVE_REGEX.test(path)) {
    return true;
  }

  // Check for backslash (Windows path separator)
  if (path.includes('\\')) {
    return true;
  }

  // Check for URL-encoded traversal (including double-encoding)
  if (URL_ENCODED_DOT_REGEX.test(path) || URL_ENCODED_SLASH_REGEX.test(path)) {
    return true;
  }

  // Check path length to prevent DoS
  if (path.length > MAX_PATH_LENGTH) {
    return true;
  }

  return false;
}

/**
 * Check if a path is safe (no traversal, no absolute paths)
 * Used for file transfer operations where paths must be relative
 */
export function isPathSafe(path: string): boolean {
  if (!path || path.length === 0) {
    return false;
  }

  // Check for absolute paths (Unix)
  if (path.startsWith('/')) {
    return false;
  }

  if (containsDangerousPatterns(path)) {
    return false;
  }

  // Normalize and check for path traversal
  const normalized = normalize(path);

  // Check for ".." components
  if (normalized.includes('..')) {
    return false;
  }

  return true;
}

/**
 * Check if a relative path is safe (no traversal)
 * Used for directory browser operations
 * Allows empty path (means root of base directory)
 */
export function isRelativePathSafe(relativePath: string): boolean {
  if (!relativePath) {
    return true; // Empty path is safe (means root of base)
  }

  // Check for absolute paths
  if (relativePath.startsWith('/')) {
    return false;
  }

  if (containsDangerousPatterns(relativePath)) {
    return false;
  }

  // Normalize and check for path traversal
  const normalized = normalize(relativePath);

  // Check for path traversal
  if (normalized.startsWith('..') || normalized.includes('/..') || normalized.includes('\\..')) {
    return false;
  }

  return true;
}

/**
 * Resolve a relative path within a base directory
 * Returns null if the resolved path escapes the base directory
 * Also validates symlinks don't escape the base directory
 */
export function resolveSecurePath(baseDir: string, relativePath: string): string | null {
  if (!isPathSafe(relativePath)) {
    return null;
  }

  const resolvedBase = resolve(baseDir);
  const resolvedPath = resolve(baseDir, relativePath);

  // Ensure resolved path is within base directory
  if (!resolvedPath.startsWith(resolvedBase)) {
    return null;
  }

  // For existing files, also check realpath to prevent symlink attacks
  if (existsSync(resolvedPath)) {
    try {
      const realPath = realpathSync(resolvedPath);
      const realBase = realpathSync(resolvedBase);
      if (!realPath.startsWith(realBase)) {
        log.warn(`Symlink escape attempt blocked: ${relativePath}`);
        return null;
      }
    } catch {
      // If realpath fails, the file may have been deleted or is inaccessible
      return null;
    }
  }

  return resolvedPath;
}

// =============================================================================
// Simple Validation (from native-terminal)
// =============================================================================

/**
 * Result of path validation
 */
export type PathValidationResult =
  | { valid: true; targetPath: string }
  | { valid: false; error: string };

/**
 * Validate that a file path is within the allowed base directory.
 * Prevents directory traversal attacks (e.g., ../../../etc/passwd).
 *
 * ## Security Checks
 * 1. Dangerous patterns (null bytes, URL encoding, etc.)
 * 2. Path traversal (../, symlink escapes)
 * 3. Path prefix validation
 *
 * @param baseDir The base directory that paths must be within
 * @param filePath The relative file path to validate
 * @returns Validation result with resolved path or error message
 */
export function validateSecurePath(baseDir: string, filePath: string): PathValidationResult {
  // Check for dangerous patterns first
  if (containsDangerousPatterns(filePath)) {
    return { valid: false, error: 'Invalid path: contains dangerous characters' };
  }

  // Resolve baseDir to absolute path to handle relative paths like "."
  const absBaseDir = resolve(baseDir);
  const targetPath = resolve(absBaseDir, filePath);

  // Security: ensure path is within base directory
  // Use absBaseDir + '/' to prevent matching /home/user/projectfoo when baseDir is /home/user/project
  if (!targetPath.startsWith(`${absBaseDir}/`) && targetPath !== absBaseDir) {
    return { valid: false, error: 'Path traversal not allowed' };
  }

  // For existing files, also check realpath to prevent symlink attacks
  if (existsSync(targetPath)) {
    try {
      const realPath = realpathSync(targetPath);
      const realBase = realpathSync(absBaseDir);
      if (!realPath.startsWith(`${realBase}/`) && realPath !== realBase) {
        log.warn(`Symlink escape attempt blocked: ${filePath}`);
        return { valid: false, error: 'Path traversal not allowed' };
      }
    } catch {
      // If realpath fails, the file may have been deleted or is inaccessible
      return { valid: false, error: 'Path not accessible' };
    }
  }

  return { valid: true, targetPath };
}

/**
 * Create an error response for invalid paths
 * @param headers Response headers to include
 */
export function createPathErrorResponse(
  error: string,
  status: number,
  headers: Record<string, string>
): Response {
  return new Response(JSON.stringify({ error }), { status, headers });
}
