/**
 * AI API Routes (Elysia)
 *
 * Handles AI chat, runners, and thread management.
 * Replaces the old ai-routes.ts with Elysia's TypeBox validation.
 */

import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { Elysia, t } from 'elysia';
import type { BlockContext, FileContext } from '@/features/ai/server/types.js';
import { validateSecurePath } from '@/utils/path-security.js';
import { coreContext } from '@/core/server/elysia/context.js';
import { ErrorResponseSchema } from '@/core/server/elysia/errors.js';

// === Request/Response Schemas ===

const InlineBlockSchema = t.Object({
  id: t.String(),
  type: t.Union([t.Literal('command'), t.Literal('claude')]),
  content: t.String(),
  metadata: t.Optional(t.Record(t.String(), t.Unknown()))
});

const FileRefSchema = t.Object({
  source: t.Union([t.Literal('plans'), t.Literal('project')]),
  path: t.String()
});

const AiRunBodySchema = t.Object({
  question: t.String({ minLength: 1 }),
  context: t.Object({
    sessionId: t.String({ minLength: 1 }),
    blocks: t.Array(t.String()),
    inlineBlocks: t.Optional(t.Array(InlineBlockSchema)),
    files: t.Optional(t.Array(FileRefSchema)),
    renderMode: t.Optional(
      t.Union([
        t.Literal('full'),
        t.Literal('errorOnly'),
        t.Literal('preview'),
        t.Literal('commandOnly')
      ])
    )
  }),
  runner: t.Optional(
    t.Union([t.Literal('claude'), t.Literal('codex'), t.Literal('gemini'), t.Literal('auto')])
  ),
  conversationId: t.Optional(t.String())
});

const SuccessResponseSchema = t.Object({
  success: t.Boolean()
});

// === Plugin ===

export const aiPlugin = new Elysia({ prefix: '/api' })
  .use(coreContext)

  // GET /api/ai/runners - runner statuses
  .get('/ai/runners', async () => {
    const { getAIService } = await import('@/features/ai/server/index.js');
    const aiService = getAIService();
    const runners = await aiService.getRunnerStatuses();
    return { runners };
  })

  // POST /api/ai/runs - submit AI chat request
  .post(
    '/ai/runs',
    async ({ sessionManager, executorManager, body, set }) => {
      const aiModule = await import('@/features/ai/server/index.js');
      const aiService = aiModule.getAIService();

      const blockContexts: BlockContext[] = [];

      for (const blockId of body.context.blocks) {
        const block = executorManager?.getBlock(blockId);
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
        const session = sessionManager.getSession(body.context.sessionId);
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

            const content = await Bun.file(targetPath).text();
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

      const renderMode = body.context.renderMode ?? 'full';

      const response = await aiService.chat(
        {
          question: body.question,
          context: {
            sessionId: body.context.sessionId,
            blocks: body.context.blocks,
            inlineBlocks: body.context.inlineBlocks,
            files: body.context.files,
            renderMode
          },
          runner: body.runner,
          conversationId: body.conversationId
        },
        blockContexts,
        fileContexts,
        undefined,
        body.context.inlineBlocks
      );

      set.status = 200;
      return response;
    },
    { body: AiRunBodySchema }
  )

  // GET /api/ai/runs/:runId - get specific run
  .get(
    '/ai/runs/:runId',
    async ({ params, error }) => {
      const { getAIService } = await import('@/features/ai/server/index.js');
      const aiService = getAIService();
      const run = aiService.getRun(params.runId);

      if (!run) {
        return error(404, { error: 'NOT_FOUND', message: `Run "${params.runId}" not found` });
      }

      return run;
    },
    {
      params: t.Object({ runId: t.String() }),
      response: { 404: ErrorResponseSchema }
    }
  )

  // GET /api/ai/threads/:threadId - get specific thread
  .get(
    '/ai/threads/:threadId',
    async ({ params, error }) => {
      const { getAIService } = await import('@/features/ai/server/index.js');
      const aiService = getAIService();
      const thread = aiService.getThread(params.threadId);

      if (!thread) {
        return error(404, { error: 'NOT_FOUND', message: `Thread "${params.threadId}" not found` });
      }

      return thread;
    },
    {
      params: t.Object({ threadId: t.String() }),
      response: { 404: ErrorResponseSchema }
    }
  )

  // GET /api/ai/sessions/:sessionId/threads - threads for a session
  .get(
    '/ai/sessions/:sessionId/threads',
    async ({ params }) => {
      const { getAIService } = await import('@/features/ai/server/index.js');
      const aiService = getAIService();
      return aiService.getSessionThreads(params.sessionId);
    },
    { params: t.Object({ sessionId: t.String() }) }
  )

  // DELETE /api/ai/sessions/:sessionId/history - clear session history
  .delete(
    '/ai/sessions/:sessionId/history',
    async ({ params }) => {
      const { getAIService } = await import('@/features/ai/server/index.js');
      const aiService = getAIService();
      aiService.clearSessionHistory(params.sessionId);
      return { success: true };
    },
    {
      params: t.Object({ sessionId: t.String() }),
      response: SuccessResponseSchema
    }
  )

  // GET /api/ai/stats - service statistics
  .get('/ai/stats', async () => {
    const { getAIService } = await import('@/features/ai/server/index.js');
    const aiService = getAIService();
    return aiService.getStats();
  })

  // DELETE /api/ai/cache - clear cache
  .delete('/ai/cache', async () => {
    const { getAIService } = await import('@/features/ai/server/index.js');
    const aiService = getAIService();
    aiService.clearCache();
    return { success: true };
  });
