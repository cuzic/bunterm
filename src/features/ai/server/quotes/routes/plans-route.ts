/**
 * Plans Route
 *
 * GET /api/claude-quotes/plans - Get plan files from ~/.claude/plans
 */

import { getPlanFiles } from '../quotes-service.js';
import { PlansParamsSchema } from './params.js';
import { handleError, successResponse } from './response.js';
import { parseParams } from './route-helpers.js';
import type { QuoteRouteContext } from './types.js';

/**
 * Handle /plans route
 *
 * No session required - reads from fixed ~/.claude/plans directory.
 */
export function handlePlansRoute(ctx: QuoteRouteContext): Response {
  const params = parseParams(ctx.params, PlansParamsSchema, ctx.headers);
  if (params instanceof Response) return params;

  try {
    const files = getPlanFiles(params.count);
    return successResponse({ files }, ctx.headers);
  } catch (error) {
    return handleError(error, ctx.headers);
  }
}
