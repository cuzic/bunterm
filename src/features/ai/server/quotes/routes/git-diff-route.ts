/**
 * Git Diff Routes
 *
 * GET /api/claude-quotes/git-diff - Get repository diff
 * GET /api/claude-quotes/git-diff-file - Get single file diff
 */

import { getFileDiff, getGitDiff } from '../quotes-service.js';
import { GitDiffFileParamsSchema, parseSearchParams } from './params.js';
import { failureResponse, handleError, successResponse } from './response.js';
import { type QuoteRouteContext, resolveWorkspaceFromParams } from './types.js';

/**
 * Handle /git-diff route
 *
 * No route-specific params - only needs workspace resolution.
 */
export async function handleGitDiffRoute(ctx: QuoteRouteContext): Promise<Response> {
  const cwd = resolveWorkspaceFromParams(ctx);
  if (cwd instanceof Response) return cwd;

  try {
    const diff = await getGitDiff(cwd);
    return successResponse(diff, ctx.headers);
  } catch (error) {
    return handleError(error, ctx.headers);
  }
}

/**
 * Handle /git-diff-file route
 *
 * Requires: path
 */
export async function handleGitDiffFileRoute(ctx: QuoteRouteContext): Promise<Response> {
  const parsed = parseSearchParams(ctx.params, GitDiffFileParamsSchema);
  if (!parsed.ok) return failureResponse(parsed.error, ctx.headers, 400);

  const cwd = resolveWorkspaceFromParams(ctx);
  if (cwd instanceof Response) return cwd;

  try {
    const diff = await getFileDiff(cwd, parsed.value.path);
    return successResponse({ path: parsed.value.path, diff }, ctx.headers);
  } catch (error) {
    return handleError(error, ctx.headers);
  }
}
