/**
 * Agents API Routes (Elysia)
 *
 * Provides agent status and timeline event streaming from Claude watchers.
 * Replaces the old agents-routes.ts with Elysia's TypeBox validation.
 */

import { Elysia, t } from 'elysia';
import { getAgentStatuses } from '@/features/agent-timeline/server/agent-status.js';
import type { AgentTimelineEvent } from '@/features/agent-timeline/server/types.js';
import { coreContext } from './context.js';

// === Plugin ===

export const agentsPlugin = new Elysia({ prefix: '/api' })
  .use(coreContext)

  // GET /api/agents/status - Get agent status for all sessions
  .get(
    '/agents/status',
    ({ sessionManager }) => {
      const statuses = getAgentStatuses(sessionManager);
      return statuses;
    },
    {}
  )

  // GET /api/agents/conflicts - Get current file conflicts between agents
  .get(
    '/agents/conflicts',
    ({ timelineService }) => {
      if (!timelineService) {
        return [];
      }
      return timelineService.getConflicts();
    },
    {}
  )

  // GET /api/agents/timeline/history - Get agent timeline event history
  .get(
    '/agents/timeline/history',
    ({ timelineService, query }) => {
      if (!timelineService) {
        return [];
      }
      const parsed = query.limit ? Number.parseInt(query.limit, 10) : NaN;
      const limit = Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
      const events = timelineService.getHistory(limit);
      return events;
    },
    {
      query: t.Object({
        limit: t.Optional(t.String())
      })
    }
  )

  // GET /api/agents/timeline/stream - SSE stream for timeline events
  .get(
    '/agents/timeline/stream',
    ({ timelineService }) => {
      if (!timelineService) {
        return new Response(
          JSON.stringify({ error: 'INTERNAL_ERROR', message: 'Timeline service not initialized' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const service = timelineService;
      const encoder = new TextEncoder();

      let cleanupFn: (() => void) | undefined;

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          // Send initial comment to establish connection
          controller.enqueue(encoder.encode(': connected\n\n'));

          // Subscribe to timeline events
          cleanupFn = service.subscribe((event: AgentTimelineEvent) => {
            try {
              const lines: string[] = [];
              lines.push(`id: ${event.id}`);
              lines.push(`event: ${event.eventType}`);
              lines.push(`data: ${JSON.stringify(event)}`);
              lines.push('');
              controller.enqueue(encoder.encode(`${lines.join('\n')}\n`));
            } catch {
              // Stream may be closed
            }
          });
        },
        cancel() {
          cleanupFn?.();
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no'
        }
      });
    },
    {}
  );
