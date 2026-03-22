/**
 * Sessions Route
 *
 * GET /api/claude-quotes/sessions - List recent Claude sessions
 */

import { getRecentClaudeSessions } from '../quotes-service.js';
import { SessionsParamsSchema } from './params.js';
import { handleError, successResponse } from './response.js';
import { parseParams } from './route-helpers.js';
import type { QuoteRouteContext } from './types.js';

/**
 * Handle /sessions route
 *
 * No session required - reads from ~/.claude/history.jsonl
 */
export function handleSessionsRoute(ctx: QuoteRouteContext): Response {
  const params = parseParams(ctx.params, SessionsParamsSchema, ctx.headers);
  if (params instanceof Response) return params;

  try {
    const sessions = getRecentClaudeSessions(params.limit);
    return successResponse({ sessions }, ctx.headers);
  } catch (error) {
    return handleError(error, ctx.headers);
  }
}
