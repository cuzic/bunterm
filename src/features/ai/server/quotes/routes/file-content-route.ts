/**
 * File Content Route
 *
 * GET /api/claude-quotes/file-content - Get file content
 */

import { readFileContent, resolveFileContentBaseDir } from '../quotes-service.js';
import { FileContentParamsSchema } from './params.js';
import { failureResponse, successResponse } from './response.js';
import { parseParams } from './route-helpers.js';
import { type QuoteRouteContext, resolveWorkspaceFromParams } from './types.js';

/**
 * Handle /file-content route
 *
 * source='project': uses workspace from session/locator
 * source='plans': uses ~/.claude/plans (no workspace needed)
 */
export function handleFileContentRoute(ctx: QuoteRouteContext): Response {
  const params = parseParams(ctx.params, FileContentParamsSchema, ctx.headers);
  if (params instanceof Response) return params;

  // Resolve workspace for project source only
  let workspaceCwd: string | undefined;
  if (params.source === 'project') {
    const cwd = resolveWorkspaceFromParams(ctx);
    if (cwd instanceof Response) return cwd;
    workspaceCwd = cwd;
  }

  const baseDir = resolveFileContentBaseDir(params.source, workspaceCwd);
  const result = readFileContent(baseDir, params.path, params.preview);

  if ('error' in result) {
    return failureResponse(
      result.error,
      ctx.headers,
      result.error === 'File not found' ? 404 : 400
    );
  }

  return successResponse(result, ctx.headers);
}
