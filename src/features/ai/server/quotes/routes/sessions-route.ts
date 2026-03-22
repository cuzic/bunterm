/**
 * Sessions Route
 *
 * GET /api/claude-quotes/sessions - List recent Claude sessions
 */

import { type QuoteRouteContext, successResponse, handleError } from './types.js';
import { getRecentClaudeSessions } from '../quotes-service.js';
import { SessionsParamsSchema, parseSearchParams } from './params.js';

/**
 * Handle /sessions route
 *
 * Success: { sessions: ClaudeSession[] }
 * Error: { error: string } with 500 status
 */
export function handleSessionsRoute(ctx: QuoteRouteContext): Response {
  const parsed = parseSearchParams(ctx.params, SessionsParamsSchema);
  const limit = parsed.ok ? parsed.data.limit : 10;

  try {
    return successResponse({ sessions: getRecentClaudeSessions(limit) }, ctx.headers);
  } catch (error) {
    return handleError(error, ctx.headers);
  }
}
