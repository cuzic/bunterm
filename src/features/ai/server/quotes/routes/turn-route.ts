/**
 * Turn Route
 *
 * GET /api/claude-quotes/turn/:uuid - Get full turn content
 */

import {
  type QuoteRouteContext,
  jsonResponse,
  errorResponse,
  resolveSession
} from './types.js';
import {
  getClaudeTurnByUuid,
  getClaudeTurnByUuidFromSession
} from '../quotes-service.js';

/**
 * Handle /turn/:uuid route
 */
export async function handleTurnRoute(
  ctx: QuoteRouteContext,
  uuid: string
): Promise<Response> {
  const claudeSessionId = ctx.params.get('claudeSessionId');
  const projectPath = ctx.params.get('projectPath');

  // Use claudeSessionId + projectPath if provided (new approach)
  if (claudeSessionId && projectPath) {
    try {
      const turn = await getClaudeTurnByUuidFromSession(projectPath, claudeSessionId, uuid);
      return turn
        ? jsonResponse(turn, ctx.headers)
        : errorResponse('Turn not found', ctx.headers, 404);
    } catch (error) {
      return errorResponse(String(error), ctx.headers, 500);
    }
  }

  // Fallback: legacy approach using bunterm session name
  const sessionResult = resolveSession(ctx);
  if ('error' in sessionResult) {
    if (sessionResult.status === 400) {
      return errorResponse(
        'Either (claudeSessionId + projectPath) or session parameter is required',
        ctx.headers
      );
    }
    return errorResponse(sessionResult.error, ctx.headers, sessionResult.status);
  }

  try {
    const turn = await getClaudeTurnByUuid(sessionResult.cwd, uuid);
    return turn
      ? jsonResponse(turn, ctx.headers)
      : errorResponse('Turn not found', ctx.headers, 404);
  } catch (error) {
    return errorResponse(String(error), ctx.headers, 500);
  }
}
