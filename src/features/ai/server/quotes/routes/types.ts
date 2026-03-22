/**
 * Claude Quotes Route Types
 *
 * Shared types and helpers for quotes API routes.
 */

import type { NativeSessionManager } from '@/core/server/session-manager.js';
import { type Result, ok, err } from '@/utils/result.js';
import {
  successResponse,
  failureResponse,
  handleError,
  type SessionResult
} from './response.js';

// Re-export response helpers for convenience
export { successResponse, failureResponse, handleError, type SessionResult };

/**
 * Context passed to quote route handlers
 */
export interface QuoteRouteContext {
  params: URLSearchParams;
  headers: Record<string, string>;
  sessionManager: NativeSessionManager;
}

/**
 * @deprecated Use successResponse instead
 */
export const jsonResponse = successResponse;

/**
 * @deprecated Use failureResponse instead
 */
export const errorResponse = failureResponse;

// === Session Resolution ===

/**
 * Session info resolved from parameters
 */
export interface SessionInfo {
  cwd: string;
  mode: 'bunterm' | 'claude';
}

/**
 * Session error with HTTP status
 */
export interface SessionError {
  error: string;
  status: 400 | 404;
}

/**
 * Resolution mode for session lookup
 */
export type ResolutionMode = 'bunterm-only' | 'claude-only' | 'prefer-claude';

/**
 * Resolve session from context (legacy - bunterm session only)
 * Returns discriminated union with ok field for type-safe handling
 */
export function resolveSession(ctx: QuoteRouteContext): SessionResult {
  const sessionName = ctx.params.get('session');
  if (!sessionName) {
    return { ok: false, error: 'session parameter required', status: 400 };
  }

  const session = ctx.sessionManager.getSession(sessionName);
  if (!session) {
    return { ok: false, error: 'Session not found', status: 404 };
  }

  return { ok: true, cwd: session.cwd };
}

/**
 * Resolve session with support for both bunterm and Claude session modes
 *
 * @param ctx - Route context
 * @param mode - Resolution mode:
 *   - 'bunterm-only': Only look for bunterm session parameter
 *   - 'claude-only': Only look for claudeSessionId + projectPath
 *   - 'prefer-claude': Try Claude params first, fall back to bunterm
 */
export function resolveSessionV2(
  ctx: QuoteRouteContext,
  mode: ResolutionMode = 'prefer-claude'
): Result<SessionInfo, SessionError> {
  const claudeSessionId = ctx.params.get('claudeSessionId');
  const projectPath = ctx.params.get('projectPath');
  const sessionName = ctx.params.get('session');

  // Try Claude mode first if applicable
  if (mode !== 'bunterm-only' && claudeSessionId && projectPath) {
    return ok({ cwd: projectPath, mode: 'claude' });
  }

  // Try bunterm mode if applicable
  if (mode !== 'claude-only' && sessionName) {
    const session = ctx.sessionManager.getSession(sessionName);
    if (session) {
      return ok({ cwd: session.cwd, mode: 'bunterm' });
    }
    return err({ error: 'Session not found', status: 404 });
  }

  // Neither mode succeeded - generate appropriate error
  if (mode === 'claude-only') {
    return err({
      error: 'claudeSessionId and projectPath parameters required',
      status: 400
    });
  }
  if (mode === 'bunterm-only') {
    return err({ error: 'session parameter required', status: 400 });
  }
  return err({
    error: 'Either (claudeSessionId + projectPath) or session parameter is required',
    status: 400
  });
}
