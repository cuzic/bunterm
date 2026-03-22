/**
 * Claude Quotes API Routes
 *
 * Handles Claude session/turn browsing, markdown files, and git diffs.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { notFound, sessionNotFound, validationFailed } from '@/core/errors.js';
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
import { err, ok } from '@/utils/result.js';
import { z } from 'zod';
import type { RouteDef } from '../../route-types.js';

// === Schemas ===

const SessionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).optional().default(10)
});

const RecentQuerySchema = z.object({
  session: z.string().optional(),
  claudeSessionId: z.string().optional(),
  projectPath: z.string().optional(),
  count: z.coerce.number().int().min(1).max(50).optional().default(20)
});

const RecentMarkdownQuerySchema = z.object({
  session: z.string().min(1, 'session is required'),
  count: z.coerce.number().int().min(1).max(50).optional().default(20),
  hours: z.coerce.number().int().min(1).max(168).optional().default(24)
});

const TurnQuerySchema = z.object({
  session: z.string().optional(),
  claudeSessionId: z.string().optional(),
  projectPath: z.string().optional()
});

const ProjectMarkdownQuerySchema = z.object({
  session: z.string().min(1, 'session is required'),
  count: z.coerce.number().int().min(1).max(50).optional().default(10)
});

const PlansQuerySchema = z.object({
  count: z.coerce.number().int().min(1).max(50).optional().default(10)
});

const FileContentQuerySchema = z.object({
  source: z.enum(['plans', 'project'], { message: 'source must be "plans" or "project"' }),
  path: z.string().min(1, 'path is required'),
  session: z.string().optional(),
  preview: z
    .string()
    .optional()
    .transform((v) => v === 'true')
});

const GitDiffQuerySchema = z.object({
  session: z.string().min(1, 'session is required')
});

const GitDiffFileQuerySchema = z.object({
  session: z.string().min(1, 'session is required'),
  path: z.string().min(1, 'path is required')
});

const RepomixQuerySchema = z.object({
  session: z.string().min(1, 'session is required'),
  path: z.string().min(1, 'path is required')
});

// === Routes ===

export const claudeQuotesRoutes: RouteDef[] = [
  {
    method: 'GET',
    path: '/api/claude-quotes/sessions',
    querySchema: SessionsQuerySchema,
    description: 'List recent Claude sessions',
    tags: ['claude-quotes'],
    handler: async (ctx) => {
      const { limit } = ctx.params as z.infer<typeof SessionsQuerySchema>;

      try {
        const sessions = getRecentClaudeSessions(limit);
        return ok({ sessions });
      } catch (error) {
        return err(validationFailed('sessions', String(error)));
      }
    }
  },

  {
    method: 'GET',
    path: '/api/claude-quotes/recent',
    querySchema: RecentQuerySchema,
    description: 'Get recent Claude turns',
    tags: ['claude-quotes'],
    handler: async (ctx) => {
      const {
        session: sessionName,
        claudeSessionId,
        projectPath,
        count
      } = ctx.params as z.infer<typeof RecentQuerySchema>;

      // Use claudeSessionId + projectPath if provided (new approach)
      if (claudeSessionId && projectPath) {
        try {
          const turns = await getRecentClaudeTurnsFromSession(projectPath, claudeSessionId, count);
          return ok({ turns });
        } catch (error) {
          return err(validationFailed('turns', String(error)));
        }
      }

      // Fallback: legacy approach using bunterm session name
      if (!sessionName) {
        return err(
          validationFailed(
            'session',
            'Either (claudeSessionId + projectPath) or session parameter is required'
          )
        );
      }

      const session = ctx.sessionManager.getSession(sessionName);
      if (!session) {
        return ok({ error: 'Session not found', turns: [] });
      }

      try {
        const turns = await getRecentClaudeTurns(session.cwd, count);
        return ok({ turns });
      } catch (error) {
        return err(validationFailed('turns', String(error)));
      }
    }
  },

  {
    method: 'GET',
    path: '/api/claude-quotes/recent-markdown',
    querySchema: RecentMarkdownQuerySchema,
    description: 'Get recent markdown files',
    tags: ['claude-quotes'],
    handler: async (ctx) => {
      const {
        session: sessionName,
        count,
        hours
      } = ctx.params as z.infer<typeof RecentMarkdownQuerySchema>;

      const session = ctx.sessionManager.getSession(sessionName);
      if (!session) {
        return ok({ error: 'Session not found', files: [] });
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
        return ok({ files });
      } catch (error) {
        return err(validationFailed('files', String(error)));
      }
    }
  },

  {
    method: 'GET',
    path: '/api/claude-quotes/turn/:uuid',
    querySchema: TurnQuerySchema,
    description: 'Get full turn content by UUID',
    tags: ['claude-quotes'],
    handler: async (ctx) => {
      const uuid = ctx.pathParams['uuid'];
      if (!uuid) {
        return err(validationFailed('uuid', 'UUID is required'));
      }

      const {
        session: sessionName,
        claudeSessionId,
        projectPath
      } = ctx.params as z.infer<typeof TurnQuerySchema>;

      // Use claudeSessionId + projectPath if provided (new approach)
      if (claudeSessionId && projectPath) {
        try {
          const turn = await getClaudeTurnByUuidFromSession(projectPath, claudeSessionId, uuid);
          if (!turn) {
            return err(notFound(`Turn ${uuid}`));
          }
          return ok(turn);
        } catch (error) {
          return err(validationFailed('turn', String(error)));
        }
      }

      // Fallback: legacy approach using bunterm session name
      if (!sessionName) {
        return err(
          validationFailed(
            'session',
            'Either (claudeSessionId + projectPath) or session parameter is required'
          )
        );
      }

      const session = ctx.sessionManager.getSession(sessionName);
      if (!session) {
        return err(sessionNotFound(sessionName));
      }

      try {
        const turn = await getClaudeTurnByUuid(session.cwd, uuid);
        if (!turn) {
          return err(notFound(`Turn ${uuid}`));
        }
        return ok(turn);
      } catch (error) {
        return err(validationFailed('turn', String(error)));
      }
    }
  },

  {
    method: 'GET',
    path: '/api/claude-quotes/project-markdown',
    querySchema: ProjectMarkdownQuerySchema,
    description: 'Get project markdown files',
    tags: ['claude-quotes'],
    handler: async (ctx) => {
      const { session: sessionName, count } = ctx.params as z.infer<
        typeof ProjectMarkdownQuerySchema
      >;

      const session = ctx.sessionManager.getSession(sessionName);
      if (!session) {
        return ok({ error: 'Session not found', files: [] });
      }

      try {
        const allFiles = collectMdFiles(session.cwd, session.cwd, {
          excludeDirs: ['node_modules', '.git', 'dist', 'build', 'coverage'],
          maxDepth: 3
        });
        const files = allFiles
          .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
          .slice(0, count);
        return ok({ files });
      } catch (error) {
        return err(validationFailed('files', String(error)));
      }
    }
  },

  {
    method: 'GET',
    path: '/api/claude-quotes/plans',
    querySchema: PlansQuerySchema,
    description: 'Get plan files from ~/.claude/plans',
    tags: ['claude-quotes'],
    handler: async (ctx) => {
      const { count } = ctx.params as z.infer<typeof PlansQuerySchema>;

      try {
        const files = getPlanFiles(count);
        return ok({ files });
      } catch (error) {
        return err(validationFailed('files', String(error)));
      }
    }
  },

  {
    method: 'GET',
    path: '/api/claude-quotes/file-content',
    querySchema: FileContentQuerySchema,
    description: 'Get file content',
    tags: ['claude-quotes'],
    handler: async (ctx) => {
      const {
        source,
        path: filePath,
        session: sessionName,
        preview
      } = ctx.params as z.infer<typeof FileContentQuerySchema>;

      let baseDir: string;
      if (source === 'plans') {
        baseDir = join(homedir(), '.claude', 'plans');
      } else {
        if (!sessionName) {
          return err(validationFailed('session', 'session parameter required for project source'));
        }
        const session = ctx.sessionManager.getSession(sessionName);
        if (!session) {
          return err(sessionNotFound(sessionName));
        }
        baseDir = session.cwd;
      }

      const result = readFileContent(baseDir, filePath, preview);
      if ('error' in result) {
        if (result.error === 'File not found') {
          return err(notFound(filePath));
        }
        return err(validationFailed('path', result.error));
      }

      return ok(result);
    }
  },

  {
    method: 'GET',
    path: '/api/claude-quotes/git-diff',
    querySchema: GitDiffQuerySchema,
    description: 'Get git diff for a session',
    tags: ['claude-quotes'],
    handler: async (ctx) => {
      const { session: sessionName } = ctx.params as z.infer<typeof GitDiffQuerySchema>;

      const session = ctx.sessionManager.getSession(sessionName);
      if (!session) {
        return err(sessionNotFound(sessionName));
      }

      try {
        const diff = await getGitDiff(session.cwd);
        return ok(diff);
      } catch (error) {
        return err(validationFailed('git-diff', String(error)));
      }
    }
  },

  {
    method: 'GET',
    path: '/api/claude-quotes/git-diff-file',
    querySchema: GitDiffFileQuerySchema,
    description: 'Get single file git diff',
    tags: ['claude-quotes'],
    handler: async (ctx) => {
      const { session: sessionName, path: filePath } = ctx.params as z.infer<
        typeof GitDiffFileQuerySchema
      >;

      const session = ctx.sessionManager.getSession(sessionName);
      if (!session) {
        return err(sessionNotFound(sessionName));
      }

      try {
        const diff = await getFileDiff(session.cwd, filePath);
        return ok({ path: filePath, diff });
      } catch (error) {
        return err(validationFailed('git-diff-file', String(error)));
      }
    }
  },

  {
    method: 'GET',
    path: '/api/claude-quotes/repomix',
    querySchema: RepomixQuerySchema,
    description: 'Run repomix on a directory and return packed content',
    tags: ['claude-quotes'],
    handler: async (ctx) => {
      const { session: sessionName, path: dirPath } = ctx.params as z.infer<
        typeof RepomixQuerySchema
      >;

      const session = ctx.sessionManager.getSession(sessionName);
      if (!session) {
        return err(sessionNotFound(sessionName));
      }

      try {
        const result = await runRepomix(session.cwd, dirPath);
        if ('error' in result) {
          if (result.error === 'Directory not found') {
            return err(notFound(dirPath));
          }
          return err(validationFailed('repomix', result.error));
        }
        return ok(result);
      } catch (error) {
        return err(validationFailed('repomix', String(error)));
      }
    }
  }
];

// === Legacy Handler (deprecated) ===

/**
 * @deprecated Use claudeQuotesRoutes with RouteRegistry instead
 */
export async function handleClaudeQuotesRoutes(): Promise<Response | null> {
  return null;
}
