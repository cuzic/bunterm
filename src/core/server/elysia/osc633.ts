/**
 * OSC 633 Side-Channel API Route
 *
 * Receives OSC 633 sequences from osc633-sender binary via Unix socket,
 * bypassing tmux passthrough. This enables Block UI to work without
 * tmux allow-passthrough configuration.
 */

import { Elysia, t } from 'elysia';
import type { OSC633Type } from '@/core/terminal/osc633-parser.js';
import { coreContext } from './context.js';

const Osc633BodySchema = t.Object({
  session: t.String(),
  type: t.String({ pattern: '^[ABCDEP]$' }),
  data: t.Optional(t.String())
});

export const osc633Plugin = new Elysia({ prefix: '/api' }).use(coreContext).post(
  '/osc633',
  ({ body, sessionManager }) => {
    const session = sessionManager.getSession(body.session);

    if (!session) {
      return { success: false, error: 'session not found' };
    }

    session.injectOSC633({ type: body.type as OSC633Type, data: body.data });

    return { success: true };
  },
  {
    body: Osc633BodySchema,
    response: t.Object({
      success: t.Boolean(),
      error: t.Optional(t.String())
    }),
    detail: {
      tags: ['blocks'],
      summary: 'Receive OSC 633 sequence via side-channel'
    }
  }
);
