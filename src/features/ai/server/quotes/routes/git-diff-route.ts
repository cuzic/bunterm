/**
 * Git Diff Routes
 *
 * GET /api/claude-quotes/git-diff - Get repository diff
 * GET /api/claude-quotes/git-diff-file - Get single file diff
 */

import { getFileDiff, getGitDiff } from '../quotes-service.js';
import { GitDiffFileParamsSchema } from './params.js';
import { handleError, successResponse } from './response.js';
import { parseParams } from './route-helpers.js';
import { type QuoteRouteContext, resolveWorkspaceFromParams } from './types.js';

/**
 * Handle /git-diff route
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
 */
export async function handleGitDiffFileRoute(ctx: QuoteRouteContext): Promise<Response> {
  const params = parseParams(ctx.params, GitDiffFileParamsSchema, ctx.headers);
  if (params instanceof Response) return params;

  const cwd = resolveWorkspaceFromParams(ctx);
  if (cwd instanceof Response) return cwd;

  try {
    const diff = await getFileDiff(cwd, params.path);
    return successResponse({ path: params.path, diff }, ctx.headers);
  } catch (error) {
    return handleError(error, ctx.headers);
  }
}
