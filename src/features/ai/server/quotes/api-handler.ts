/**
 * Claude Quotes API Handler
 *
 * Dispatches Claude Quotes API requests to specific route handlers.
 *
 * Routes:
 * - GET /api/claude-quotes/sessions - List recent Claude sessions
 * - GET /api/claude-quotes/recent - Get recent turns
 * - GET /api/claude-quotes/recent-markdown - Get recent markdown files
 * - GET /api/claude-quotes/turn/:uuid - Get full turn content
 * - GET /api/claude-quotes/project-markdown - Get project *.md files
 * - GET /api/claude-quotes/plans - Get plan files
 * - GET /api/claude-quotes/file-content - Get file content
 * - GET /api/claude-quotes/git-diff - Get git diff
 * - GET /api/claude-quotes/git-diff-file - Get single file diff
 *
 * ## Design Policy for Route Development
 *
 * ### Adding New Routes
 *
 * 1. **Write directly first** - Don't abstract until a pattern repeats 3+ times
 * 2. **Use the standard route skeleton**:
 *    - Step 1: Validate path params (if any)
 *    - Step 2: Parse search params with parseParams()
 *    - Step 3: Resolve context with resolveWorkspaceFromParams() or resolveClaudeFromParams()
 *    - Step 4: Execute service logic
 * 3. **Self-review with the 10-item checklist** (see below)
 *
 * ### Avoid These Patterns
 *
 * - `V2` / `legacy` / `compat` suffixes - redesign instead of layering
 * - `mode` parameters that change behavior significantly - make separate routes
 * - Helper functions used by only 1 route - inline the logic
 * - Generic "utility" modules that grow unbounded
 *
 * ### 10-Item Self-Review Checklist
 *
 * Before merging a new route, verify:
 * 1. Does the schema reflect the actual API contract?
 * 2. Are locator fields (session, claudeSessionId, projectPath) optional?
 * 3. Is validation done at the route entry (not deep in service code)?
 * 4. Is the error response shape consistent ({ error: string })?
 * 5. Are response helper imports from response.ts (not types.ts)?
 * 6. Does the route follow the 5-step skeleton?
 * 7. Are there no ad-hoc { error: string } union types (use Result instead)?
 * 8. Is there no "future-proofing" code that isn't used yet?
 * 9. Are comments explaining "why" not "what"?
 * 10. Would a new developer understand this route in under 5 minutes?
 *
 * ### File Responsibilities
 *
 * - `params.ts` - Zod schemas for parameter validation only
 * - `types.ts` - Context and locator types + resolution functions only
 * - `response.ts` - Response helpers only (success, failure, handleError)
 * - `*-route.ts` - Route logic (parse → resolve → service → response)
 */

import type { NativeSessionManager } from '@/core/server/session-manager.js';
import { handleFileContentRoute } from './routes/file-content-route.js';
import { handleGitDiffFileRoute, handleGitDiffRoute } from './routes/git-diff-route.js';
import { handleMarkdownRoute } from './routes/markdown-route.js';
import { handlePlansRoute } from './routes/plans-route.js';
import { handleRecentMarkdownRoute, handleRecentRoute } from './routes/recent-route.js';
import { handleSessionsRoute } from './routes/sessions-route.js';
import { handleTurnRoute } from './routes/turn-route.js';
import type { QuoteRouteContext } from './routes/types.js';

// === Route Definition Types ===

/** Handler for static routes (exact or prefix match) */
type StaticHandler = (ctx: QuoteRouteContext) => Response | Promise<Response>;

/** Handler for pattern routes with capture groups */
type PatternHandler = (ctx: QuoteRouteContext, captures: string[]) => Response | Promise<Response>;

/** Exact path match route */
interface ExactRoute {
  kind: 'exact';
  path: string;
  handler: StaticHandler;
}

/** Prefix match route */
interface PrefixRoute {
  kind: 'prefix';
  prefix: string;
  handler: StaticHandler;
}

/** Pattern (regex) match route with captured groups */
interface PatternRoute {
  kind: 'pattern';
  pattern: RegExp;
  handler: PatternHandler;
}

/** Discriminated union of route types */
type RouteDefinition = ExactRoute | PrefixRoute | PatternRoute;

// === Route Table ===

/**
 * Route table for Claude Quotes API
 *
 * Routes are matched in order:
 * 1. Exact matches first
 * 2. Pattern (regex) matches
 * 3. Prefix matches (longer prefixes first)
 */
const ROUTE_TABLE: RouteDefinition[] = [
  // Exact matches
  {
    kind: 'exact',
    path: '/claude-quotes/sessions',
    handler: handleSessionsRoute
  },
  // Pattern matches (dynamic routes)
  {
    kind: 'pattern',
    pattern: /^\/claude-quotes\/turn\/([^/]+)$/,
    handler: (ctx, captures) => {
      // captures[0] is guaranteed by the regex pattern having one capture group
      const uuid = decodeURIComponent(captures[0] ?? '');
      return handleTurnRoute(ctx, uuid);
    }
  },
  // Prefix matches (ordered by specificity - longer prefixes first)
  {
    kind: 'prefix',
    prefix: '/claude-quotes/recent-markdown',
    handler: handleRecentMarkdownRoute
  },
  {
    kind: 'prefix',
    prefix: '/claude-quotes/recent',
    handler: handleRecentRoute
  },
  {
    kind: 'prefix',
    prefix: '/claude-quotes/project-markdown',
    handler: handleMarkdownRoute
  },
  {
    kind: 'prefix',
    prefix: '/claude-quotes/plans',
    handler: handlePlansRoute
  },
  {
    kind: 'prefix',
    prefix: '/claude-quotes/file-content',
    handler: handleFileContentRoute
  },
  {
    kind: 'prefix',
    prefix: '/claude-quotes/git-diff-file',
    handler: handleGitDiffFileRoute
  },
  {
    kind: 'prefix',
    prefix: '/claude-quotes/git-diff',
    handler: handleGitDiffRoute
  }
];

// === Route Matching Result ===

/** Match result for exact/prefix routes */
interface StaticMatch {
  kind: 'exact' | 'prefix';
  handler: StaticHandler;
}

/** Match result for pattern routes */
interface PatternMatch {
  kind: 'pattern';
  handler: PatternHandler;
  captures: string[];
}

type RouteMatch = StaticMatch | PatternMatch;

/**
 * Find matching route from route table
 */
function findRoute(apiPath: string): RouteMatch | null {
  for (const route of ROUTE_TABLE) {
    switch (route.kind) {
      case 'exact':
        if (apiPath === route.path) {
          return { kind: 'exact', handler: route.handler };
        }
        break;
      case 'pattern': {
        const match = apiPath.match(route.pattern);
        if (match) {
          // Extract capture groups (skip full match at index 0)
          const captures = match.slice(1).filter((c): c is string => c !== undefined);
          return { kind: 'pattern', handler: route.handler, captures };
        }
        break;
      }
      case 'prefix':
        if (apiPath.startsWith(route.prefix)) {
          return { kind: 'prefix', handler: route.handler };
        }
        break;
    }
  }
  return null;
}

/**
 * Handle Claude Quotes API request
 * @returns Response if handled, null if not a claude-quotes route
 */
async function handleClaudeQuotesApi(
  req: Request,
  apiPath: string,
  method: string,
  headers: Record<string, string>,
  sessionManager: NativeSessionManager
): Promise<Response | null> {
  // Only handle GET requests to /claude-quotes/*
  if (method !== 'GET' || !apiPath.startsWith('/claude-quotes/')) {
    return null;
  }

  const match = findRoute(apiPath);
  if (!match) {
    return null;
  }

  const params = new URL(req.url).searchParams;
  const ctx: QuoteRouteContext = { params, headers, sessionManager };

  // Type-safe handler dispatch based on match kind
  if (match.kind === 'pattern') {
    return match.handler(ctx, match.captures);
  }
  return match.handler(ctx);
}

// Export for testing
export { findRoute, ROUTE_TABLE, type RouteDefinition, type RouteMatch };
