/**
 * Blocks API Routes
 *
 * Handles command block operations: execute, cancel, stream.
 */

import { z } from 'zod';
import { ok, err } from '@/utils/result.js';
import { sessionNotFound, blockNotFound, validationFailed } from '@/core/errors.js';
import type { CommandRequest } from '@/core/protocol/index.js';
import {
  type CommandExecutorManager,
  createCommandExecutorManager
} from '@/core/terminal/command-executor-manager.js';
import { createBlockSSEStream } from '@/features/blocks/server/block-event-emitter.js';
import type { NativeSessionManager } from '@/core/server/session-manager.js';
import type { RouteDef, RouteContext } from '../../route-types.js';
import { securityHeaders } from '../../utils.js';

// Command executor manager (lazy initialized)
let executorManager: CommandExecutorManager | null = null;

/**
 * Get or create the command executor manager
 */
export function getExecutorManager(sessionManager: NativeSessionManager): CommandExecutorManager {
  if (!executorManager) {
    executorManager = createCommandExecutorManager(sessionManager);
  }
  return executorManager;
}

// === Schemas ===

const ExecuteCommandBodySchema = z.object({
  command: z.string().min(1, 'command is required'),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  mode: z.enum(['ephemeral', 'persistent']).optional()
});

const CancelBlockBodySchema = z.object({
  signal: z.enum(['SIGTERM', 'SIGINT', 'SIGKILL']).optional().default('SIGTERM')
});

const GetChunksQuerySchema = z.object({
  fromSeq: z.coerce.number().int().optional(),
  stream: z.enum(['stdout', 'stderr', 'all']).optional().default('all'),
  limit: z.coerce.number().int().optional()
});

// === Routes ===

export const blocksRoutes: RouteDef[] = [
  {
    method: 'POST',
    path: '/api/sessions/:name/commands',
    bodySchema: ExecuteCommandBodySchema,
    description: 'Execute a command in a session',
    tags: ['blocks'],
    handler: async (ctx) => {
      const sessionName = ctx.pathParams['name'];
      if (!sessionName) {
        return err(validationFailed('name', 'Session name is required'));
      }

      if (!ctx.sessionManager.hasSession(sessionName)) {
        return err(sessionNotFound(sessionName));
      }

      const body = ctx.body as CommandRequest;
      const executor = getExecutorManager(ctx.sessionManager);
      const response = await executor.executeCommand(sessionName, body);

      return ok(response);
    }
  },

  {
    method: 'GET',
    path: '/api/sessions/:name/blocks',
    description: 'List blocks for a session',
    tags: ['blocks'],
    handler: async (ctx) => {
      const sessionName = ctx.pathParams['name'];
      if (!sessionName) {
        return err(validationFailed('name', 'Session name is required'));
      }

      if (!ctx.sessionManager.hasSession(sessionName)) {
        return err(sessionNotFound(sessionName));
      }

      const executor = getExecutorManager(ctx.sessionManager);
      const blocks = executor.getSessionBlocks(sessionName);

      return ok(blocks);
    }
  },

  {
    method: 'GET',
    path: '/api/sessions/:name/integration',
    description: 'Get OSC 633 integration status',
    tags: ['blocks'],
    handler: async (ctx) => {
      const sessionName = ctx.pathParams['name'];
      if (!sessionName) {
        return err(validationFailed('name', 'Session name is required'));
      }

      if (!ctx.sessionManager.hasSession(sessionName)) {
        return err(sessionNotFound(sessionName));
      }

      const executor = getExecutorManager(ctx.sessionManager);
      const status = executor.getIntegrationStatus(sessionName);

      if (!status) {
        return ok({
          osc633: false,
          status: 'unknown',
          testedAt: null,
          message: 'Integration not tested. Use persistent mode to test.'
        });
      }

      return ok(status);
    }
  },

  {
    method: 'GET',
    path: '/api/blocks/:blockId',
    description: 'Get a specific block',
    tags: ['blocks'],
    handler: async (ctx) => {
      const blockId = ctx.pathParams['blockId'];
      if (!blockId) {
        return err(validationFailed('blockId', 'Block ID is required'));
      }

      const executor = getExecutorManager(ctx.sessionManager);
      const block = executor.getBlock(blockId);

      if (!block) {
        return err(blockNotFound(blockId));
      }

      return ok(block);
    }
  },

  {
    method: 'POST',
    path: '/api/blocks/:blockId/cancel',
    bodySchema: CancelBlockBodySchema,
    description: 'Cancel a running command',
    tags: ['blocks'],
    handler: async (ctx) => {
      const blockId = ctx.pathParams['blockId'];
      if (!blockId) {
        return err(validationFailed('blockId', 'Block ID is required'));
      }
      const { signal } = ctx.body as z.infer<typeof CancelBlockBodySchema>;

      const executor = getExecutorManager(ctx.sessionManager);
      const block = executor.getBlock(blockId);

      if (!block) {
        return err(blockNotFound(blockId));
      }

      let response = null;
      for (const session of ctx.sessionManager.listSessions()) {
        const result = executor.cancelCommand(session.name, blockId, signal);
        if (result.success) {
          response = result;
          break;
        }
      }

      if (!response) {
        return err(validationFailed('blockId', 'Block is not running or cannot be canceled'));
      }

      return ok(response);
    }
  },

  {
    method: 'POST',
    path: '/api/blocks/:blockId/pin',
    description: 'Pin a block',
    tags: ['blocks'],
    handler: async (ctx) => {
      const blockId = ctx.pathParams['blockId'];
      if (!blockId) {
        return err(validationFailed('blockId', 'Block ID is required'));
      }

      const executor = getExecutorManager(ctx.sessionManager);
      const success = executor.pinBlock(blockId);

      if (!success) {
        return err(blockNotFound(blockId));
      }

      return ok({ success: true, blockId });
    }
  },

  {
    method: 'DELETE',
    path: '/api/blocks/:blockId/pin',
    description: 'Unpin a block',
    tags: ['blocks'],
    handler: async (ctx) => {
      const blockId = ctx.pathParams['blockId'];
      if (!blockId) {
        return err(validationFailed('blockId', 'Block ID is required'));
      }

      const executor = getExecutorManager(ctx.sessionManager);
      const success = executor.unpinBlock(blockId);

      if (!success) {
        return err(blockNotFound(blockId));
      }

      return ok({ success: true, blockId });
    }
  },

  {
    method: 'GET',
    path: '/api/blocks/:blockId/chunks',
    querySchema: GetChunksQuerySchema,
    description: 'Get output chunks for a block',
    tags: ['blocks'],
    handler: async (ctx) => {
      const blockId = ctx.pathParams['blockId'];
      if (!blockId) {
        return err(validationFailed('blockId', 'Block ID is required'));
      }
      const { fromSeq, stream, limit } = ctx.params as z.infer<typeof GetChunksQuerySchema>;

      const executor = getExecutorManager(ctx.sessionManager);
      const block = executor.getBlock(blockId);

      if (!block) {
        return err(blockNotFound(blockId));
      }

      const result = executor.getBlockChunks(blockId, {
        fromSeq,
        stream,
        limit
      });

      return ok(result);
    }
  }
];

// === SSE Stream Handler (returns streaming response, not JSON) ===

/**
 * Handle SSE stream for block events - returns streaming response directly
 */
export async function handleBlockStream(ctx: RouteContext): Promise<Response | null> {
  const url = new URL(ctx.req.url);
  const match = url.pathname.match(/\/api\/blocks\/([^/]+)\/stream$/);
  if (!match?.[1]) {
    return null;
  }

  const blockId = decodeURIComponent(match[1]);

  const executor = getExecutorManager(ctx.sessionManager);
  const block = executor.getBlock(blockId);

  if (!block) {
    return new Response(JSON.stringify({ error: `Block "${blockId}" not found` }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...securityHeaders(ctx.sentryEnabled) }
    });
  }

  const lastEventId = ctx.req.headers.get('Last-Event-ID');
  const fromSeq = lastEventId ? Number.parseInt(lastEventId, 10) : undefined;

  const eventEmitter = executor.getEventEmitter();
  const sseStream = createBlockSSEStream(eventEmitter, blockId, { lastEventId: fromSeq });

  return new Response(sseStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...securityHeaders(ctx.sentryEnabled)
    }
  });
}

// === Legacy Handler (deprecated) ===

/**
 * @deprecated Use blocksRoutes with RouteRegistry instead
 */
export async function handleBlocksRoutes(): Promise<Response | null> {
  return null;
}
