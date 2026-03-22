/**
 * Recent Route
 *
 * GET /api/claude-quotes/recent - Get recent Claude turns
 * GET /api/claude-quotes/recent-markdown - Get recent markdown files
 */

import {
  type QuoteRouteContext,
  jsonResponse,
  errorResponse,
  resolveSession
} from './types.js';
import {
  collectMdFiles,
  getRecentClaudeTurns,
  getRecentClaudeTurnsFromSession
} from '../quotes-service.js';

/**
 * Handle /recent-markdown route
 */
export async function handleRecentMarkdownRoute(ctx: QuoteRouteContext): Promise<Response> {
  const count = Math.min(Number.parseInt(ctx.params.get('count') ?? '20', 10), 50);
  const hours = Math.min(Number.parseInt(ctx.params.get('hours') ?? '24', 10), 168);

  const sessionResult = resolveSession(ctx);
  if ('error' in sessionResult) {
    return jsonResponse({ error: sessionResult.error, files: [] }, ctx.headers);
  }

  try {
    const cutoffTime = Date.now() - hours * 60 * 60 * 1000;
    const allFiles = collectMdFiles(sessionResult.cwd, sessionResult.cwd, {
      excludeDirs: ['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '__pycache__'],
      maxDepth: 10
    });
    const files = allFiles
      .filter((f) => new Date(f.modifiedAt).getTime() > cutoffTime)
      .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
      .slice(0, count);
    return jsonResponse({ files }, ctx.headers);
  } catch (error) {
    return errorResponse(String(error), ctx.headers, 500);
  }
}

/**
 * Handle /recent route (Claude turns)
 */
export async function handleRecentRoute(ctx: QuoteRouteContext): Promise<Response> {
  const claudeSessionId = ctx.params.get('claudeSessionId');
  const projectPath = ctx.params.get('projectPath');
  const count = Math.min(Number.parseInt(ctx.params.get('count') ?? '20', 10), 50);

  // Use claudeSessionId + projectPath if provided (new approach)
  if (claudeSessionId && projectPath) {
    try {
      const turns = await getRecentClaudeTurnsFromSession(projectPath, claudeSessionId, count);
      return jsonResponse({ turns }, ctx.headers);
    } catch (error) {
      return errorResponse(String(error), ctx.headers, 500);
    }
  }

  // Fallback: legacy approach using bunterm session name
  const sessionResult = resolveSession(ctx);
  if ('error' in sessionResult) {
    if (sessionResult.status === 404) {
      return jsonResponse({ error: sessionResult.error, turns: [] }, ctx.headers);
    }
    return errorResponse(
      'Either (claudeSessionId + projectPath) or session parameter is required',
      ctx.headers
    );
  }

  try {
    const turns = await getRecentClaudeTurns(sessionResult.cwd, count);
    return jsonResponse({ turns }, ctx.headers);
  } catch (error) {
    return errorResponse(String(error), ctx.headers, 500);
  }
}
