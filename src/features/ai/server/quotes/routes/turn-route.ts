/**
 * Turn Route
 *
 * GET /api/claude-quotes/turn/:uuid - Get full turn content
 */

import {
  type QuoteRouteContext,
  successResponse,
  failureResponse,
  handleError,
  resolveSessionV2
} from './types.js';
import {
  getClaudeTurnByUuid,
  getClaudeTurnByUuidFromSession
} from '../quotes-service.js';

/**
 * Handle /turn/:uuid route
 *
 * Success: ClaudeTurn object
 * Error: { error: string } with appropriate status code
 */
export async function handleTurnRoute(
  ctx: QuoteRouteContext,
  uuid: string
): Promise<Response> {
  const claudeSessionId = ctx.params.get('claudeSessionId');

  // Use unified session resolver
  const sessionResult = resolveSessionV2(ctx, 'prefer-claude');
  if (!sessionResult.ok) {
    return failureResponse(sessionResult.error.error, ctx.headers, sessionResult.error.status);
  }

  try {
    // Use different service methods based on resolution mode
    const turn =
      sessionResult.value.mode === 'claude'
        ? await getClaudeTurnByUuidFromSession(sessionResult.value.cwd, claudeSessionId!, uuid)
        : await getClaudeTurnByUuid(sessionResult.value.cwd, uuid);

    return turn
      ? successResponse(turn, ctx.headers)
      : failureResponse('Turn not found', ctx.headers, 404);
  } catch (error) {
    return handleError(error, ctx.headers);
  }
}
