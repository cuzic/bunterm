/**
 * Sessions Route
 *
 * GET /api/claude-quotes/sessions - List recent Claude sessions
 */

import { type QuoteRouteContext, jsonResponse, errorResponse } from './types.js';
import { getRecentClaudeSessions } from '../quotes-service.js';

/**
 * Handle /sessions route
 */
export function handleSessionsRoute(ctx: QuoteRouteContext): Response {
  const limit = Math.min(Number.parseInt(ctx.params.get('limit') ?? '10', 10), 20);
  try {
    return jsonResponse({ sessions: getRecentClaudeSessions(limit) }, ctx.headers);
  } catch (error) {
    return errorResponse(String(error), ctx.headers, 500);
  }
}
