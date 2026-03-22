/**
 * Plans Route
 *
 * GET /api/claude-quotes/plans - Get plan files from ~/.claude/plans
 */

import { type QuoteRouteContext, successResponse, handleError } from './types.js';
import { getPlanFiles } from '../quotes-service.js';
import { PlansParamsSchema, parseSearchParams } from './params.js';

/**
 * Handle /plans route
 *
 * Success: { files: PlanFile[] }
 * Error: { error: string } with 500 status
 */
export function handlePlansRoute(ctx: QuoteRouteContext): Response {
  const parsed = parseSearchParams(ctx.params, PlansParamsSchema);
  const count = parsed.ok ? parsed.value.count : 10;

  try {
    const files = getPlanFiles(count);
    return successResponse({ files }, ctx.headers);
  } catch (error) {
    return handleError(error, ctx.headers);
  }
}
