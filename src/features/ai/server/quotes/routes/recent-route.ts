/**
 * Recent Route
 *
 * GET /api/claude-quotes/recent - Get recent Claude turns
 * GET /api/claude-quotes/recent-markdown - Get recent markdown files
 */

import {
  collectRecentMarkdown,
  getRecentClaudeTurns,
  getRecentClaudeTurnsFromSession
} from '../quotes-service.js';
import { RecentMarkdownParamsSchema, RecentParamsSchema } from './params.js';
import { handleError, successResponse } from './response.js';
import { parseParams } from './route-helpers.js';
import {
  type QuoteRouteContext,
  resolveClaudeFromParams,
  resolveWorkspaceFromParams
} from './types.js';

/**
 * Handle /recent-markdown route
 */
export function handleRecentMarkdownRoute(ctx: QuoteRouteContext): Response {
  const params = parseParams(ctx.params, RecentMarkdownParamsSchema, ctx.headers);
  if (params instanceof Response) return params;

  const cwd = resolveWorkspaceFromParams(ctx);
  if (cwd instanceof Response) return cwd;

  try {
    const files = collectRecentMarkdown(cwd, params.hours, params.count);
    return successResponse({ files }, ctx.headers);
  } catch (error) {
    return handleError(error, ctx.headers);
  }
}

/**
 * Handle /recent route (Claude turns)
 */
export async function handleRecentRoute(ctx: QuoteRouteContext): Promise<Response> {
  const params = parseParams(ctx.params, RecentParamsSchema, ctx.headers);
  if (params instanceof Response) return params;

  const claude = resolveClaudeFromParams(ctx);
  if (claude instanceof Response) return claude;

  try {
    const turns = claude.claudeSessionId
      ? await getRecentClaudeTurnsFromSession(claude.cwd, claude.claudeSessionId, params.count)
      : await getRecentClaudeTurns(claude.cwd, params.count);
    return successResponse({ turns }, ctx.headers);
  } catch (error) {
    return handleError(error, ctx.headers);
  }
}
