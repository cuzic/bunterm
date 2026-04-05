/**
 * Blocks API Routes (Elysia)
 *
 * Handles command block operations: execute, cancel, stream.
 * Replaces the old blocks-routes.ts with Elysia's TypeBox validation.
 */

import { Elysia, t } from 'elysia';
import type { CommandRequest } from '@/core/protocol/index.js';
import { coreContext } from '@/core/server/elysia/context.js';
import { ErrorResponseSchema } from '@/core/server/elysia/errors.js';
import type { CommandExecutorManager } from '@/core/terminal/command-executor-manager.js';
import { createBlockSSEStream } from '@/features/blocks/server/block-event-emitter.js';

// === Helper ===

/**
 * Get executorManager from context, throwing if not initialized.
 */
function requireExecutor(executorManager: CommandExecutorManager | null): CommandExecutorManager {
  if (!executorManager) {
    throw new Error('executorManager not initialized');
  }
  return executorManager;
}

// === Response Schemas ===

const BlockSchema = t.Object({
  id: t.String(),
  sessionName: t.Optional(t.String()),
  command: t.Optional(t.String()),
  status: t.String(),
  exitCode: t.Optional(t.Number()),
  startedAt: t.Optional(t.String()),
  completedAt: t.Optional(t.String()),
  pinned: t.Optional(t.Boolean())
});

const ExecuteResponseSchema = t.Object({
  blockId: t.String(),
  status: t.String()
});

const CancelResponseSchema = t.Object({
  success: t.Boolean(),
  blockId: t.Optional(t.String())
});

const PinResponseSchema = t.Object({
  success: t.Boolean(),
  blockId: t.String()
});

const IntegrationStatusSchema = t.Object({
  osc633: t.Boolean(),
  status: t.String(),
  testedAt: t.Union([t.String(), t.Null()]),
  message: t.Optional(t.String())
});

// === Plugin ===

export const blocksPlugin = new Elysia({ prefix: '/api' })
  .use(coreContext)

  // POST /api/sessions/:name/commands - Execute a command in a session
  .post(
    '/sessions/:name/commands',
    async ({ sessionManager, executorManager, params, body, set, error }) => {
      if (!sessionManager.hasSession(params.name)) {
        return error(404, {
          error: 'SESSION_NOT_FOUND',
          message: `Session '${params.name}' not found`
        });
      }

      const executor = requireExecutor(executorManager);
      const response = await executor.executeCommand(params.name, body as CommandRequest);
      set.status = 201;
      return response;
    },
    {
      params: t.Object({ name: t.String() }),
      body: t.Object({
        command: t.String({ minLength: 1 }),
        cwd: t.Optional(t.String()),
        env: t.Optional(t.Record(t.String(), t.String())),
        mode: t.Optional(t.Union([t.Literal('ephemeral'), t.Literal('persistent')]))
      }),
      response: {
        201: ExecuteResponseSchema,
        404: ErrorResponseSchema
      }
    }
  )

  // GET /api/sessions/:name/blocks - List blocks for a session
  .get(
    '/sessions/:name/blocks',
    ({ sessionManager, executorManager, params, error }) => {
      if (!sessionManager.hasSession(params.name)) {
        return error(404, {
          error: 'SESSION_NOT_FOUND',
          message: `Session '${params.name}' not found`
        });
      }

      const executor = requireExecutor(executorManager);
      const blocks = executor.getSessionBlocks(params.name);
      return blocks;
    },
    {
      params: t.Object({ name: t.String() }),
      response: {
        200: t.Array(BlockSchema),
        404: ErrorResponseSchema
      }
    }
  )

  // GET /api/sessions/:name/integration - Get OSC 633 integration status
  .get(
    '/sessions/:name/integration',
    ({ sessionManager, executorManager, params, error }) => {
      if (!sessionManager.hasSession(params.name)) {
        return error(404, {
          error: 'SESSION_NOT_FOUND',
          message: `Session '${params.name}' not found`
        });
      }

      const executor = requireExecutor(executorManager);
      const status = executor.getIntegrationStatus(params.name);

      if (!status) {
        return {
          osc633: false,
          status: 'unknown',
          testedAt: null,
          message: 'Integration not tested. Use persistent mode to test.'
        };
      }

      return status;
    },
    {
      params: t.Object({ name: t.String() }),
      response: {
        200: IntegrationStatusSchema,
        404: ErrorResponseSchema
      }
    }
  )

  // GET /api/blocks/:blockId - Get a specific block
  .get(
    '/blocks/:blockId',
    ({ executorManager, params, error }) => {
      const executor = requireExecutor(executorManager);
      const block = executor.getBlock(params.blockId);

      if (!block) {
        return error(404, {
          error: 'BLOCK_NOT_FOUND',
          message: `Block '${params.blockId}' not found`
        });
      }

      return block;
    },
    {
      params: t.Object({ blockId: t.String() }),
      response: {
        200: BlockSchema,
        404: ErrorResponseSchema
      }
    }
  )

  // POST /api/blocks/:blockId/cancel - Cancel a running command
  .post(
    '/blocks/:blockId/cancel',
    ({ sessionManager, executorManager, params, body, error }) => {
      const executor = requireExecutor(executorManager);
      const block = executor.getBlock(params.blockId);

      if (!block) {
        return error(404, {
          error: 'BLOCK_NOT_FOUND',
          message: `Block '${params.blockId}' not found`
        });
      }

      const signal = body.signal ?? 'SIGTERM';
      let response = null;
      for (const session of sessionManager.listSessions()) {
        const result = executor.cancelCommand(session.name, params.blockId, signal);
        if (result.success) {
          response = result;
          break;
        }
      }

      if (!response) {
        return error(400, {
          error: 'CANCEL_FAILED',
          message: 'Block is not running or cannot be canceled'
        });
      }

      return response;
    },
    {
      params: t.Object({ blockId: t.String() }),
      body: t.Object({
        signal: t.Optional(
          t.Union([t.Literal('SIGTERM'), t.Literal('SIGINT'), t.Literal('SIGKILL')])
        )
      }),
      response: {
        200: CancelResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema
      }
    }
  )

  // POST /api/blocks/:blockId/pin - Pin a block
  .post(
    '/blocks/:blockId/pin',
    ({ executorManager, params, error }) => {
      const executor = requireExecutor(executorManager);
      const success = executor.pinBlock(params.blockId);

      if (!success) {
        return error(404, {
          error: 'BLOCK_NOT_FOUND',
          message: `Block '${params.blockId}' not found`
        });
      }

      return { success: true, blockId: params.blockId };
    },
    {
      params: t.Object({ blockId: t.String() }),
      response: {
        200: PinResponseSchema,
        404: ErrorResponseSchema
      }
    }
  )

  // DELETE /api/blocks/:blockId/pin - Unpin a block
  .delete(
    '/blocks/:blockId/pin',
    ({ executorManager, params, error }) => {
      const executor = requireExecutor(executorManager);
      const success = executor.unpinBlock(params.blockId);

      if (!success) {
        return error(404, {
          error: 'BLOCK_NOT_FOUND',
          message: `Block '${params.blockId}' not found`
        });
      }

      return { success: true, blockId: params.blockId };
    },
    {
      params: t.Object({ blockId: t.String() }),
      response: {
        200: PinResponseSchema,
        404: ErrorResponseSchema
      }
    }
  )

  // GET /api/blocks/:blockId/chunks - Get output chunks for a block
  .get(
    '/blocks/:blockId/chunks',
    ({ executorManager, params, query, error }) => {
      const executor = requireExecutor(executorManager);
      const block = executor.getBlock(params.blockId);

      if (!block) {
        return error(404, {
          error: 'BLOCK_NOT_FOUND',
          message: `Block '${params.blockId}' not found`
        });
      }

      const parsedFromSeq = query.fromSeq ? Number.parseInt(query.fromSeq, 10) : NaN;
      const fromSeq =
        Number.isFinite(parsedFromSeq) && parsedFromSeq >= 0 ? parsedFromSeq : undefined;
      const parsedLimit = query.limit ? Number.parseInt(query.limit, 10) : NaN;
      const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined;
      const stream = query.stream ?? 'all';

      const result = executor.getBlockChunks(params.blockId, {
        fromSeq,
        stream,
        limit
      });

      return result;
    },
    {
      params: t.Object({ blockId: t.String() }),
      query: t.Object({
        fromSeq: t.Optional(t.String()),
        stream: t.Optional(t.Union([t.Literal('stdout'), t.Literal('stderr'), t.Literal('all')])),
        limit: t.Optional(t.String())
      })
    }
  )

  // GET /api/blocks/:blockId/stream - SSE stream for block events
  .get(
    '/blocks/:blockId/stream',
    ({ executorManager, blockEventEmitter, params, request, set }) => {
      const executor = requireExecutor(executorManager);
      const block = executor.getBlock(params.blockId);

      if (!block) {
        set.status = 404;
        return { error: 'BLOCK_NOT_FOUND', message: `Block '${params.blockId}' not found` };
      }

      if (!blockEventEmitter) {
        set.status = 500;
        return { error: 'INTERNAL_ERROR', message: 'Event emitter not initialized' };
      }

      const lastEventIdHeader = request.headers.get('Last-Event-ID');
      const lastEventId = lastEventIdHeader ? Number.parseInt(lastEventIdHeader, 10) : undefined;
      const sseStream = createBlockSSEStream(blockEventEmitter, params.blockId, { lastEventId });

      return new Response(sseStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no'
        }
      });
    },
    {
      params: t.Object({ blockId: t.String() }),
      response: {
        404: ErrorResponseSchema,
        500: ErrorResponseSchema
      }
    }
  );
