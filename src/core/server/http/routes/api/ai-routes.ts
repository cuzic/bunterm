/**
 * AI API Routes
 *
 * Handles AI chat, runners, and thread management.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { ok, err } from '@/utils/result.js';
import { notFound, validationFailed } from '@/core/errors.js';
import { getExecutorManager } from './blocks-routes.js';
import type { BlockContext, FileContext } from '@/features/ai/server/types.js';
import { validateSecurePath } from '@/utils/path-security.js';
import type { RouteDef } from '../../route-types.js';

// === Schemas ===

const AiRunBodySchema = z.object({
  question: z.string().min(1, 'question is required'),
  context: z.object({
    sessionId: z.string().min(1),
    blocks: z.array(z.string()),
    inlineBlocks: z
      .array(
        z.object({
          id: z.string(),
          type: z.enum(['command', 'claude']),
          content: z.string(),
          metadata: z.record(z.string(), z.unknown()).optional()
        })
      )
      .optional(),
    files: z
      .array(
        z.object({
          source: z.enum(['plans', 'project']),
          path: z.string()
        })
      )
      .optional(),
    renderMode: z.enum(['full', 'errorOnly', 'preview', 'commandOnly']).optional().default('full')
  }),
  runner: z.enum(['claude', 'codex', 'gemini', 'auto']).optional(),
  conversationId: z.string().optional()
});

type AiRunBody = z.infer<typeof AiRunBodySchema>;

// === Routes ===

export const aiRoutes: RouteDef[] = [
  {
    method: 'GET',
    path: '/api/ai/runners',
    description: 'Get AI runner statuses',
    tags: ['ai'],
    handler: async () => {
      const { getAIService } = await import('@/features/ai/server/index.js');
      const aiService = getAIService();
      const runners = await aiService.getRunnerStatuses();
      return ok({ runners });
    }
  },

  {
    method: 'POST',
    path: '/api/ai/runs',
    bodySchema: AiRunBodySchema,
    description: 'Submit an AI chat request',
    tags: ['ai'],
    handler: async (ctx) => {
      const body = ctx.body as AiRunBody;

      const aiModule = await import('@/features/ai/server/index.js');
      const aiService = aiModule.getAIService();

      const executor = getExecutorManager(ctx.sessionManager);
      const blockContexts: BlockContext[] = [];

      for (const blockId of body.context.blocks) {
        const block = executor.getBlock(blockId);
        if (block) {
          let status: 'running' | 'success' | 'error';
          switch (block.status) {
            case 'queued':
            case 'running':
              status = 'running';
              break;
            case 'success':
              status = 'success';
              break;
            default:
              status = 'error';
          }

          const output = [block.stdoutPreview, block.stderrPreview].filter(Boolean).join('\n');

          blockContexts.push({
            id: block.id,
            command: block.command,
            output,
            exitCode: block.exitCode,
            status,
            cwd: block.effectiveCwd,
            startedAt: block.startedAt,
            endedAt: block.endedAt
          });
        }
      }

      const fileContexts: FileContext[] = [];
      if (body.context.files && Array.isArray(body.context.files)) {
        const session = ctx.sessionManager.getSession(body.context.sessionId);
        const sessionCwd = session?.cwd ?? process.cwd();

        for (const fileRef of body.context.files) {
          try {
            let baseDir: string;
            if (fileRef.source === 'plans') {
              baseDir = join(homedir(), '.claude', 'plans');
            } else {
              baseDir = sessionCwd;
            }

            const pathResult = validateSecurePath(baseDir, fileRef.path);
            if (!pathResult.valid) continue;
            const targetPath = pathResult.targetPath!;

            if (!existsSync(targetPath)) continue;

            const stat = statSync(targetPath);
            if (stat.size > 100 * 1024) continue;

            const content = readFileSync(targetPath, 'utf-8');
            const name = basename(targetPath);

            fileContexts.push({
              source: fileRef.source,
              path: fileRef.path,
              name,
              content,
              size: stat.size,
              modifiedAt: stat.mtime.toISOString()
            });
          } catch {
            // Skip files that can't be read
          }
        }
      }

      const response = await aiService.chat(
        {
          question: body.question,
          context: {
            sessionId: body.context.sessionId,
            blocks: body.context.blocks,
            inlineBlocks: body.context.inlineBlocks,
            files: body.context.files,
            renderMode: body.context.renderMode ?? 'full'
          },
          runner: body.runner,
          conversationId: body.conversationId
        },
        blockContexts,
        fileContexts,
        undefined,
        body.context.inlineBlocks
      );

      return ok(response);
    }
  },

  {
    method: 'GET',
    path: '/api/ai/runs/:runId',
    description: 'Get a specific AI run',
    tags: ['ai'],
    handler: async (ctx) => {
      const runId = ctx.pathParams['runId'];
      if (!runId) {
        return err(validationFailed('runId', 'Run ID is required'));
      }
      const { getAIService } = await import('@/features/ai/server/index.js');
      const aiService = getAIService();
      const run = aiService.getRun(runId);

      if (!run) {
        return err(notFound(`Run "${runId}" not found`));
      }

      return ok(run);
    }
  },

  {
    method: 'GET',
    path: '/api/ai/threads/:threadId',
    description: 'Get a specific AI thread',
    tags: ['ai'],
    handler: async (ctx) => {
      const threadId = ctx.pathParams['threadId'];
      if (!threadId) {
        return err(validationFailed('threadId', 'Thread ID is required'));
      }
      const { getAIService } = await import('@/features/ai/server/index.js');
      const aiService = getAIService();
      const thread = aiService.getThread(threadId);

      if (!thread) {
        return err(notFound(`Thread "${threadId}" not found`));
      }

      return ok(thread);
    }
  },

  {
    method: 'GET',
    path: '/api/ai/sessions/:sessionId/threads',
    description: 'Get threads for a session',
    tags: ['ai'],
    handler: async (ctx) => {
      const sessionId = ctx.pathParams['sessionId'];
      if (!sessionId) {
        return err(validationFailed('sessionId', 'Session ID is required'));
      }
      const { getAIService } = await import('@/features/ai/server/index.js');
      const aiService = getAIService();
      const threads = aiService.getSessionThreads(sessionId);
      return ok(threads);
    }
  },

  {
    method: 'DELETE',
    path: '/api/ai/sessions/:sessionId/history',
    description: 'Clear AI history for a session',
    tags: ['ai'],
    handler: async (ctx) => {
      const sessionId = ctx.pathParams['sessionId'];
      if (!sessionId) {
        return err(validationFailed('sessionId', 'Session ID is required'));
      }
      const { getAIService } = await import('@/features/ai/server/index.js');
      const aiService = getAIService();
      aiService.clearSessionHistory(sessionId);
      return ok({ success: true });
    }
  },

  {
    method: 'GET',
    path: '/api/ai/stats',
    description: 'Get AI service statistics',
    tags: ['ai'],
    handler: async () => {
      const { getAIService } = await import('@/features/ai/server/index.js');
      const aiService = getAIService();
      const stats = aiService.getStats();
      return ok(stats);
    }
  },

  {
    method: 'DELETE',
    path: '/api/ai/cache',
    description: 'Clear AI service cache',
    tags: ['ai'],
    handler: async () => {
      const { getAIService } = await import('@/features/ai/server/index.js');
      const aiService = getAIService();
      aiService.clearCache();
      return ok({ success: true });
    }
  }
];

// === Legacy Handler (deprecated) ===

/**
 * @deprecated Use aiRoutes with RouteRegistry instead
 */
export async function handleAiRoutes(): Promise<Response | null> {
  return null;
}
