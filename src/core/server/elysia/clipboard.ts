/**
 * Clipboard Side-Channel API Route
 *
 * Receives clipboard text from CLI tools (e.g., toclip) via Unix socket,
 * and broadcasts it to all connected browser clients via WebSocket.
 * The browser then writes to the system clipboard using the Clipboard API.
 */

import { Elysia, t } from 'elysia';
import { createClipboardMessage } from '@/core/protocol/index.js';
import { coreContext } from './context.js';

const ClipboardBodySchema = t.Object({
  session: t.String(),
  text: t.String(),
  encoding: t.Optional(t.Union([t.Literal('base64'), t.Literal('plain')]))
});

export const clipboardPlugin = new Elysia({ prefix: '/api' }).use(coreContext).post(
  '/clipboard',
  ({ body, sessionManager }) => {
    const session = sessionManager.getSession(body.session);

    if (!session) {
      return { success: false, error: 'session not found' };
    }

    const text =
      body.encoding === 'base64' ? Buffer.from(body.text, 'base64').toString('utf-8') : body.text;

    session.broadcastMessage(createClipboardMessage(text));

    return { success: true };
  },
  {
    body: ClipboardBodySchema,
    response: t.Object({
      success: t.Boolean(),
      error: t.Optional(t.String())
    }),
    detail: {
      tags: ['clipboard'],
      summary: 'Send text to browser clipboard via WebSocket'
    }
  }
);
