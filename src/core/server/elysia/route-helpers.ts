/**
 * Shared route helpers for Elysia handlers.
 *
 * Eliminates duplicated session-lookup + path-validation sequences
 * across files.ts, preview.ts, and similar route modules.
 */

// biome-ignore lint: existsSync used for synchronous path existence check in validation helper
import { existsSync } from 'node:fs';
import type { NativeSessionManager } from '@/core/server/session-manager.js';
import type { TerminalSession } from '@/core/terminal/session.js';
import { validateSecurePath } from '@/utils/path-security.js';

// =============================================================================
// Types
// =============================================================================

interface ValidResult {
  valid: true;
  targetPath: string;
  session: TerminalSession;
}

interface InvalidResult {
  valid: false;
  status: number;
  error: string;
  message: string;
}

export type FilePathValidationResult = ValidResult | InvalidResult;

interface ValidateFilePathOptions {
  /** Check that the resolved path exists on disk (default: false) */
  checkExistence?: boolean;
}

// =============================================================================
// Helper
// =============================================================================

/**
 * Validate a file path within a session context.
 *
 * Performs three checks in order:
 * 1. Session exists
 * 2. Path passes security validation (no traversal)
 * 3. (optional) File/directory exists on disk
 *
 * @returns A discriminated union — callers check `result.valid` to narrow.
 */
export function validateFilePath(
  sessionManager: NativeSessionManager,
  sessionName: string,
  filePath: string,
  options: ValidateFilePathOptions = {}
): FilePathValidationResult {
  const session = sessionManager.getSession(sessionName);
  if (!session) {
    return {
      valid: false,
      status: 404,
      error: 'SESSION_NOT_FOUND',
      message: `Session '${sessionName}' not found`
    };
  }

  const pathResult = validateSecurePath(session.cwd, filePath);
  if (!pathResult.valid) {
    return {
      valid: false,
      status: 403,
      error: 'PATH_TRAVERSAL',
      message: `Invalid path: ${filePath}`
    };
  }

  if (options.checkExistence && !existsSync(pathResult.targetPath)) {
    return {
      valid: false,
      status: 404,
      error: 'NOT_FOUND',
      message: 'Path not found'
    };
  }

  return {
    valid: true,
    targetPath: pathResult.targetPath,
    session
  };
}
