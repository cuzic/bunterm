/**
 * Markdown Route
 *
 * GET /api/claude-quotes/project-markdown - Get project markdown files
 */

import { collectProjectMarkdown } from '../quotes-service.js';
import { ProjectMarkdownParamsSchema } from './params.js';
import { handleError, successResponse } from './response.js';
import { parseParams } from './route-helpers.js';
import { type QuoteRouteContext, resolveWorkspaceFromParams } from './types.js';

/**
 * Handle /project-markdown route
 */
export function handleMarkdownRoute(ctx: QuoteRouteContext): Response {
  const params = parseParams(ctx.params, ProjectMarkdownParamsSchema, ctx.headers);
  if (params instanceof Response) return params;

  const cwd = resolveWorkspaceFromParams(ctx);
  if (cwd instanceof Response) return cwd;

  try {
    const files = collectProjectMarkdown(cwd, params.count);
    return successResponse({ files }, ctx.headers);
  } catch (error) {
    return handleError(error, ctx.headers);
  }
}
