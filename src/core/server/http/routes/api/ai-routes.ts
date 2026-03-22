/**
 * AI API Routes
 *
 * Handles AI chat, runners, and thread management.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import type { ApiContext } from './types.js';
import { jsonResponse, errorResponse } from '../../utils.js';
import { getExecutorManager } from './blocks-routes.js';
import type { BlockContext, FileContext } from '@/features/ai/server/types.js';
import { validateSecurePath } from '@/utils/path-security.js';

/**
 * Handle AI API routes
 */
export async function handleAiRoutes(ctx: ApiContext): Promise<Response | null> {
  const { apiPath, method, req, sessionManager, sentryEnabled } = ctx;

  // GET /api/ai/runners
  if (apiPath === '/ai/runners' && method === 'GET') {
    const { getAIService } = await import('@/features/ai/server/index.js');
    const aiService = getAIService();
    const runners = await aiService.getRunnerStatuses();
    return jsonResponse({ runners }, { sentryEnabled });
  }

  // POST /api/ai/runs
  if (apiPath === '/ai/runs' && method === 'POST') {
    try {
      const body = (await req.json()) as {
        question: string;
        context: {
          sessionId: string;
          blocks: string[];
          inlineBlocks?: Array<{
            id: string;
            type: 'command' | 'claude';
            content: string;
            metadata?: Record<string, unknown>;
          }>;
          files?: Array<{ source: 'plans' | 'project'; path: string }>;
          renderMode?: 'full' | 'errorOnly' | 'preview' | 'commandOnly';
        };
        runner?: 'claude' | 'codex' | 'gemini' | 'auto';
        conversationId?: string;
      };

      if (!body.question || typeof body.question !== 'string') {
        return errorResponse('question is required', 400, sentryEnabled);
      }

      if (!body.context?.sessionId || !Array.isArray(body.context?.blocks)) {
        return errorResponse('context with sessionId and blocks is required', 400, sentryEnabled);
      }

      const aiModule = await import('@/features/ai/server/index.js');
      const aiService = aiModule.getAIService();

      const executor = getExecutorManager(sessionManager);
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

      return jsonResponse(response, { sentryEnabled });
    } catch (error) {
      return errorResponse(String(error), 500, sentryEnabled);
    }
  }

  // GET /api/ai/runs/:runId
  const runMatch = apiPath.match(/^\/ai\/runs\/([^/]+)$/);
  if (runMatch?.[1] && method === 'GET') {
    const runId = decodeURIComponent(runMatch[1]);
    const { getAIService } = await import('@/features/ai/server/index.js');
    const aiService = getAIService();
    const run = aiService.getRun(runId);

    if (!run) {
      return errorResponse(`Run "${runId}" not found`, 404, sentryEnabled);
    }

    return jsonResponse(run, { sentryEnabled });
  }

  // GET /api/ai/threads/:threadId
  const threadMatch = apiPath.match(/^\/ai\/threads\/([^/]+)$/);
  if (threadMatch?.[1] && method === 'GET') {
    const threadId = decodeURIComponent(threadMatch[1]);
    const { getAIService } = await import('@/features/ai/server/index.js');
    const aiService = getAIService();
    const thread = aiService.getThread(threadId);

    if (!thread) {
      return errorResponse(`Thread "${threadId}" not found`, 404, sentryEnabled);
    }

    return jsonResponse(thread, { sentryEnabled });
  }

  // GET /api/ai/sessions/:sessionId/threads
  const sessionThreadsMatch = apiPath.match(/^\/ai\/sessions\/([^/]+)\/threads$/);
  if (sessionThreadsMatch?.[1] && method === 'GET') {
    const sessionId = decodeURIComponent(sessionThreadsMatch[1]);
    const { getAIService } = await import('@/features/ai/server/index.js');
    const aiService = getAIService();
    const threads = aiService.getSessionThreads(sessionId);
    return jsonResponse(threads, { sentryEnabled });
  }

  // DELETE /api/ai/sessions/:sessionId/history
  const clearHistoryMatch = apiPath.match(/^\/ai\/sessions\/([^/]+)\/history$/);
  if (clearHistoryMatch?.[1] && method === 'DELETE') {
    const sessionId = decodeURIComponent(clearHistoryMatch[1]);
    const { getAIService } = await import('@/features/ai/server/index.js');
    const aiService = getAIService();
    aiService.clearSessionHistory(sessionId);
    return jsonResponse({ success: true }, { sentryEnabled });
  }

  // GET /api/ai/stats
  if (apiPath === '/ai/stats' && method === 'GET') {
    const { getAIService } = await import('@/features/ai/server/index.js');
    const aiService = getAIService();
    const stats = aiService.getStats();
    return jsonResponse(stats, { sentryEnabled });
  }

  // DELETE /api/ai/cache
  if (apiPath === '/ai/cache' && method === 'DELETE') {
    const { getAIService } = await import('@/features/ai/server/index.js');
    const aiService = getAIService();
    aiService.clearCache();
    return jsonResponse({ success: true }, { sentryEnabled });
  }

  return null;
}
