/**
 * Path Security Utilities
 *
 * Utilities for validating file paths to prevent directory traversal attacks.
 */

import { resolve } from 'node:path';

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
 * @param baseDir The base directory that paths must be within
 * @param filePath The relative file path to validate
 * @returns Validation result with resolved path or error message
 */
export function validateSecurePath(baseDir: string, filePath: string): PathValidationResult {
  const targetPath = resolve(baseDir, filePath);

  // Security: ensure path is within base directory
  if (!targetPath.startsWith(baseDir)) {
    return { valid: false, error: 'Invalid path' };
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
