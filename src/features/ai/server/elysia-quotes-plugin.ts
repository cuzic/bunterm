/**
 * Claude Quotes API Routes (Elysia)
 *
 * Handles Claude session/turn browsing, markdown files, and git diffs.
 * Replaces the old claude-quotes-routes.ts with Elysia's TypeBox validation.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { Elysia, t } from 'elysia';
import {
  collectMdFiles,
  getClaudeTurnByUuid,
  getClaudeTurnByUuidFromSession,
  getFileDiff,
  getGitDiff,
  getPlanFiles,
  getRecentClaudeSessions,
  getRecentClaudeTurns,
  getRecentClaudeTurnsFromSession,
  readFileContent,
  runRepomix
} from '@/features/ai/server/quotes/quotes-service.js';
import { coreContext } from '@/core/server/elysia/context.js';
import { ErrorResponseSchema } from '@/core/server/elysia/errors.js';

// === Plugin ===

export const claudeQuotesPlugin = new Elysia({ prefix: '/api' })
  .use(coreContext)

  // GET /api/claude-quotes/sessions - List recent Claude sessions
  .get(
    '/claude-quotes/sessions',
    async ({ query }) => {
      const limit = query.limit ?? 10;
      try {
        const sessions = await getRecentClaudeSessions(limit);
        return { sessions };
      } catch (error) {
        return { sessions: [], error: String(error) };
      }
    },
    {
      query: t.Object({
        limit: t.Optional(t.Number({ minimum: 1, maximum: 20, default: 10 }))
      })
    }
  )

  // GET /api/claude-quotes/recent - Get recent Claude turns
  .get(
    '/claude-quotes/recent',
    async ({ query, sessionManager, error: httpError }) => {
      const { session: sessionName, claudeSessionId, projectPath, count = 20 } = query;

      // Use claudeSessionId + projectPath if provided (new approach)
      if (claudeSessionId && projectPath) {
        try {
          const turns = await getRecentClaudeTurnsFromSession(projectPath, claudeSessionId, count);
          return { turns };
        } catch (err) {
          return httpError(400, { error: 'VALIDATION_FAILED', message: String(err) });
        }
      }

      // Fallback: legacy approach using bunterm session name
      if (!sessionName) {
        return httpError(400, {
          error: 'VALIDATION_FAILED',
          message: 'Either (claudeSessionId + projectPath) or session parameter is required'
        });
      }

      const session = sessionManager.getSession(sessionName);
      if (!session) {
        return { error: 'Session not found', turns: [] };
      }

      try {
        const turns = await getRecentClaudeTurns(session.cwd, count);
        return { turns };
      } catch (err) {
        return httpError(400, { error: 'VALIDATION_FAILED', message: String(err) });
      }
    },
    {
      query: t.Object({
        session: t.Optional(t.String()),
        claudeSessionId: t.Optional(t.String()),
        projectPath: t.Optional(t.String()),
        count: t.Optional(t.Number({ minimum: 1, maximum: 50, default: 20 }))
      }),
      response: {
        400: ErrorResponseSchema
      }
    }
  )

  // GET /api/claude-quotes/recent-markdown - Get recent markdown files
  .get(
    '/claude-quotes/recent-markdown',
    ({ query, sessionManager, error: httpError }) => {
      const { session: sessionName, count = 20, hours = 24 } = query;

      const session = sessionManager.getSession(sessionName);
      if (!session) {
        return { error: 'Session not found', files: [] };
      }

      try {
        const cutoffTime = Date.now() - hours * 60 * 60 * 1000;
        const allFiles = collectMdFiles(session.cwd, session.cwd, {
          excludeDirs: [
            'node_modules',
            '.git',
            'dist',
            'build',
            'coverage',
            '.next',
            '__pycache__'
          ],
          maxDepth: 10
        });
        const files = allFiles
          .filter((f) => new Date(f.modifiedAt).getTime() > cutoffTime)
          .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
          .slice(0, count);
        return { files };
      } catch (err) {
        return httpError(400, { error: 'VALIDATION_FAILED', message: String(err) });
      }
    },
    {
      query: t.Object({
        session: t.String({ minLength: 1 }),
        count: t.Optional(t.Number({ minimum: 1, maximum: 50, default: 20 })),
        hours: t.Optional(t.Number({ minimum: 1, maximum: 168, default: 24 }))
      }),
      response: {
        400: ErrorResponseSchema
      }
    }
  )

  // GET /api/claude-quotes/turn/:uuid - Get full turn content by UUID
  .get(
    '/claude-quotes/turn/:uuid',
    async ({ params, query, sessionManager, error: httpError }) => {
      const { uuid } = params;
      const { session: sessionName, claudeSessionId, projectPath } = query;

      // Use claudeSessionId + projectPath if provided (new approach)
      if (claudeSessionId && projectPath) {
        try {
          const turn = await getClaudeTurnByUuidFromSession(projectPath, claudeSessionId, uuid);
          if (!turn) {
            return httpError(404, { error: 'NOT_FOUND', message: `Turn ${uuid}` });
          }
          return turn;
        } catch (err) {
          return httpError(400, { error: 'VALIDATION_FAILED', message: String(err) });
        }
      }

      // Fallback: legacy approach using bunterm session name
      if (!sessionName) {
        return httpError(400, {
          error: 'VALIDATION_FAILED',
          message: 'Either (claudeSessionId + projectPath) or session parameter is required'
        });
      }

      const session = sessionManager.getSession(sessionName);
      if (!session) {
        return httpError(404, {
          error: 'SESSION_NOT_FOUND',
          message: `Session '${sessionName}' not found`
        });
      }

      try {
        const turn = await getClaudeTurnByUuid(session.cwd, uuid);
        if (!turn) {
          return httpError(404, { error: 'NOT_FOUND', message: `Turn ${uuid}` });
        }
        return turn;
      } catch (err) {
        return httpError(400, { error: 'VALIDATION_FAILED', message: String(err) });
      }
    },
    {
      params: t.Object({ uuid: t.String() }),
      query: t.Object({
        session: t.Optional(t.String()),
        claudeSessionId: t.Optional(t.String()),
        projectPath: t.Optional(t.String())
      }),
      response: {
        400: ErrorResponseSchema,
        404: ErrorResponseSchema
      }
    }
  )

  // GET /api/claude-quotes/project-markdown - Get project markdown files
  .get(
    '/claude-quotes/project-markdown',
    ({ query, sessionManager, error: httpError }) => {
      const { session: sessionName, count = 10 } = query;

      const session = sessionManager.getSession(sessionName);
      if (!session) {
        return { error: 'Session not found', files: [] };
      }

      try {
        const allFiles = collectMdFiles(session.cwd, session.cwd, {
          excludeDirs: ['node_modules', '.git', 'dist', 'build', 'coverage'],
          maxDepth: 3
        });
        const files = allFiles
          .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
          .slice(0, count);
        return { files };
      } catch (err) {
        return httpError(400, { error: 'VALIDATION_FAILED', message: String(err) });
      }
    },
    {
      query: t.Object({
        session: t.String({ minLength: 1 }),
        count: t.Optional(t.Number({ minimum: 1, maximum: 50, default: 10 }))
      }),
      response: {
        400: ErrorResponseSchema
      }
    }
  )

  // GET /api/claude-quotes/plans - Get plan files from ~/.claude/plans
  .get(
    '/claude-quotes/plans',
    ({ query, error: httpError }) => {
      const count = query.count ?? 10;
      try {
        const files = getPlanFiles(count);
        return { files };
      } catch (err) {
        return httpError(400, { error: 'VALIDATION_FAILED', message: String(err) });
      }
    },
    {
      query: t.Object({
        count: t.Optional(t.Number({ minimum: 1, maximum: 50, default: 10 }))
      }),
      response: {
        400: ErrorResponseSchema
      }
    }
  )

  // GET /api/claude-quotes/file-content - Get file content
  .get(
    '/claude-quotes/file-content',
    ({ query, sessionManager, error: httpError }) => {
      const { source, path: filePath, session: sessionName, preview } = query;

      let baseDir: string;
      if (source === 'plans') {
        baseDir = join(homedir(), '.claude', 'plans');
      } else {
        if (!sessionName) {
          return httpError(400, {
            error: 'VALIDATION_FAILED',
            message: 'session parameter required for project source'
          });
        }
        const session = sessionManager.getSession(sessionName);
        if (!session) {
          return httpError(404, {
            error: 'SESSION_NOT_FOUND',
            message: `Session '${sessionName}' not found`
          });
        }
        baseDir = session.cwd;
      }

      const result = readFileContent(baseDir, filePath, preview === 'true');
      if ('error' in result) {
        if (result.error === 'File not found') {
          return httpError(404, { error: 'NOT_FOUND', message: filePath });
        }
        return httpError(400, { error: 'VALIDATION_FAILED', message: result.error });
      }

      return result;
    },
    {
      query: t.Object({
        source: t.Union([t.Literal('plans'), t.Literal('project')]),
        path: t.String({ minLength: 1 }),
        session: t.Optional(t.String()),
        preview: t.Optional(t.String())
      }),
      response: {
        400: ErrorResponseSchema,
        404: ErrorResponseSchema
      }
    }
  )

  // GET /api/claude-quotes/git-diff - Get git diff for a session
  .get(
    '/claude-quotes/git-diff',
    async ({ query, sessionManager, error: httpError }) => {
      const { session: sessionName } = query;

      const session = sessionManager.getSession(sessionName);
      if (!session) {
        return httpError(404, {
          error: 'SESSION_NOT_FOUND',
          message: `Session '${sessionName}' not found`
        });
      }

      try {
        const diff = await getGitDiff(session.cwd);
        return diff;
      } catch (err) {
        return httpError(400, { error: 'VALIDATION_FAILED', message: String(err) });
      }
    },
    {
      query: t.Object({
        session: t.String({ minLength: 1 })
      }),
      response: {
        400: ErrorResponseSchema,
        404: ErrorResponseSchema
      }
    }
  )

  // GET /api/claude-quotes/git-diff-file - Get single file git diff
  .get(
    '/claude-quotes/git-diff-file',
    async ({ query, sessionManager, error: httpError }) => {
      const { session: sessionName, path: filePath } = query;

      const session = sessionManager.getSession(sessionName);
      if (!session) {
        return httpError(404, {
          error: 'SESSION_NOT_FOUND',
          message: `Session '${sessionName}' not found`
        });
      }

      try {
        const diff = await getFileDiff(session.cwd, filePath);
        return { path: filePath, diff };
      } catch (err) {
        return httpError(400, { error: 'VALIDATION_FAILED', message: String(err) });
      }
    },
    {
      query: t.Object({
        session: t.String({ minLength: 1 }),
        path: t.String({ minLength: 1 })
      }),
      response: {
        400: ErrorResponseSchema,
        404: ErrorResponseSchema
      }
    }
  )

  // GET /api/claude-quotes/repomix - Run repomix on a directory
  .get(
    '/claude-quotes/repomix',
    async ({ query, sessionManager, error: httpError }) => {
      const { session: sessionName, path: dirPath } = query;

      const session = sessionManager.getSession(sessionName);
      if (!session) {
        return httpError(404, {
          error: 'SESSION_NOT_FOUND',
          message: `Session '${sessionName}' not found`
        });
      }

      try {
        const result = await runRepomix(session.cwd, dirPath);
        if ('error' in result) {
          if (result.error === 'Directory not found') {
            return httpError(404, { error: 'NOT_FOUND', message: dirPath });
          }
          return httpError(400, { error: 'VALIDATION_FAILED', message: result.error });
        }
        return result;
      } catch (err) {
        return httpError(400, { error: 'VALIDATION_FAILED', message: String(err) });
      }
    },
    {
      query: t.Object({
        session: t.String({ minLength: 1 }),
        path: t.String({ minLength: 1 })
      }),
      response: {
        400: ErrorResponseSchema,
        404: ErrorResponseSchema
      }
    }
  );
