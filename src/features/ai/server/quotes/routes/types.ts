/**
 * Claude Quotes Route Types
 *
 * Exports:
 * - QuoteRouteContext: context passed to route handlers
 * - ClaudeContext: resolved Claude session context
 * - resolveWorkspaceFromParams(): resolve cwd from params
 * - resolveClaudeFromParams(): resolve cwd + session ID from params
 */

import type { NativeSessionManager } from '@/core/server/session-manager.js';
import { type Result, err, ok } from '@/utils/result.js';
import { failureResponse } from './response.js';

/** Context passed to quote route handlers */
export interface QuoteRouteContext {
  params: URLSearchParams;
  headers: Record<string, string>;
  sessionManager: NativeSessionManager;
}

// =============================================================================
// Locator Types
// =============================================================================
//
// Routes accept two input modes:
// 1. bunterm session: session=<name> -> uses sessionManager to get cwd
// 2. Claude locator: claudeSessionId + projectPath -> uses projectPath as cwd

/**
 * HTTP input locator - identifies the request source (internal)
 */
type Locator =
  | { kind: 'bunterm'; sessionName: string }
  | { kind: 'claude'; projectPath: string; claudeSessionId: string };

/**
 * Resolved Claude context - workspace + optional conversation reference
 *
 * When claudeSessionId is present, use session-specific queries.
 * When absent, use project-level queries (most recent session).
 */
export interface ClaudeContext {
  cwd: string;
  claudeSessionId: string | null;
}

/**
 * Route error with HTTP status (internal)
 */
interface RouteError {
  error: string;
  status: 400 | 404;
}

/**
 * Parse URL params into a Locator (internal helper)
 *
 * Used internally by resolveWorkspaceFromParams/resolveClaudeFromParams.
 * Routes should use the one-step helpers instead of calling this directly.
 */
function parseLocator(params: URLSearchParams): Result<Locator, RouteError> {
  const sessionName = params.get('session');
  const claudeSessionId = params.get('claudeSessionId');
  const projectPath = params.get('projectPath');

  // Claude mode takes precedence
  if (claudeSessionId && projectPath) {
    return ok({ kind: 'claude', projectPath, claudeSessionId });
  }

  // Bunterm mode
  if (sessionName) {
    return ok({ kind: 'bunterm', sessionName });
  }

  return err({
    error: 'Either session or (claudeSessionId + projectPath) is required',
    status: 400
  });
}

// =============================================================================
// Resolution Helpers
// =============================================================================

/**
 * Resolve workspace (cwd) from request params.
 * Returns either the cwd string or a failure Response.
 */
export function resolveWorkspaceFromParams(ctx: QuoteRouteContext): string | Response {
  const locator = parseLocator(ctx.params);
  if (!locator.ok) {
    return failureResponse(locator.error.error, ctx.headers, locator.error.status);
  }

  if (locator.value.kind === 'claude') {
    return locator.value.projectPath;
  }

  // bunterm mode - lookup session
  const session = ctx.sessionManager.getSession(locator.value.sessionName);
  if (!session) {
    return failureResponse('Session not found', ctx.headers, 404);
  }
  return session.cwd;
}

/**
 * Resolve Claude context from request params.
 * Returns either ClaudeContext or a failure Response.
 */
export function resolveClaudeFromParams(ctx: QuoteRouteContext): ClaudeContext | Response {
  const locator = parseLocator(ctx.params);
  if (!locator.ok) {
    return failureResponse(locator.error.error, ctx.headers, locator.error.status);
  }

  if (locator.value.kind === 'claude') {
    return {
      cwd: locator.value.projectPath,
      claudeSessionId: locator.value.claudeSessionId
    };
  }

  // bunterm mode - lookup session
  const session = ctx.sessionManager.getSession(locator.value.sessionName);
  if (!session) {
    return failureResponse('Session not found', ctx.headers, 404);
  }

  return {
    cwd: session.cwd,
    claudeSessionId: null
  };
}
