/**
 * WebSocket Plugin (Elysia)
 *
 * Handles WebSocket connections for native terminal sessions.
 * Replaces ws-handler.ts with Elysia's built-in WebSocket support.
 *
 * Security features:
 * - Origin validation for CSWSH protection
 * - Optional Sec-WebSocket-Protocol bearer token authentication
 */

import { Elysia, t } from 'elysia';
import type { NativeTerminalWebSocket } from '@/core/protocol/index.js';
import { createErrorMessage, serializeServerMessage } from '@/core/protocol/index.js';

// === WebSocket Message Schemas (TypeBox) ===
// Single source of truth for client→server WS protocol.
// Elysia validates incoming messages against this schema.

const WsInputMessage = t.Object({ type: t.Literal('input'), data: t.String() });
const WsResizeMessage = t.Object({
  type: t.Literal('resize'),
  cols: t.Number({ minimum: 1 }),
  rows: t.Number({ minimum: 1 })
});
const WsPingMessage = t.Object({ type: t.Literal('ping') });
const WsWatchFileMessage = t.Object({
  type: t.Literal('watchFile'),
  path: t.String({ minLength: 1 })
});
const WsUnwatchFileMessage = t.Object({
  type: t.Literal('unwatchFile'),
  path: t.String({ minLength: 1 })
});
const WsWatchDirMessage = t.Object({
  type: t.Literal('watchDir'),
  path: t.String({ minLength: 1 })
});
const WsUnwatchDirMessage = t.Object({
  type: t.Literal('unwatchDir'),
  path: t.String({ minLength: 1 })
});
const WsReplayRequestMessage = t.Object({ type: t.Literal('replayRequest') });

const WsClientMessage = t.Union([
  WsInputMessage,
  WsResizeMessage,
  WsPingMessage,
  WsWatchFileMessage,
  WsUnwatchFileMessage,
  WsWatchDirMessage,
  WsUnwatchDirMessage,
  WsReplayRequestMessage
]);

import {
  createSecurityConfig,
  extractBearerToken,
  getTokenGenerator,
  validateOrigin
} from '@/core/server/ws/index.js';
import { coreContext } from './context.js';

export interface WebSocketPluginOptions {
  /** Enable token authentication (default: false for backward compatibility) */
  enableTokenAuth?: boolean;
}

export const websocketPlugin = (options: WebSocketPluginOptions = {}) => {
  const { enableTokenAuth = false } = options;

  return new Elysia({ name: 'websocket' }).use(coreContext).ws('/:sessionName/ws', {
    body: WsClientMessage,
    beforeHandle({ request, config }) {
      // Build SecurityConfig from coreContext config on each request
      const securityConfig = createSecurityConfig({
        devMode: config.security.dev_mode,
        allowedOrigins: config.security.allowed_origins,
        hostname: config.hostname
      });

      // Origin validation on upgrade
      const originResult = validateOrigin(request, securityConfig);
      if (!originResult.allowed) {
        return new Response(`Forbidden: ${originResult.reason}`, { status: 403 });
      }

      // Token authentication (optional)
      if (enableTokenAuth) {
        const protocols = request.headers.get('Sec-WebSocket-Protocol');
        const token = extractBearerToken(protocols);

        if (!token) {
          return new Response('Unauthorized: Token required', { status: 401 });
        }
      }
      return;
    },

    async open(ws) {
      const sessionName = ws.data.params.sessionName;
      const sessionManager = ws.data.sessionManager;
      const config = ws.data.config;

      // Token validation (if enabled)
      if (enableTokenAuth) {
        const protocols = ws.data.request?.headers.get('Sec-WebSocket-Protocol') ?? null;
        const token = extractBearerToken(protocols);

        if (token) {
          const tokenGenerator = getTokenGenerator();
          const validation = await tokenGenerator.validate(token);

          if (!validation.valid) {
            ws.send(
              serializeServerMessage(createErrorMessage(`Unauthorized: ${validation.error}`))
            );
            ws.close();
            return;
          }

          if (validation.session?.sid !== sessionName) {
            ws.send(
              serializeServerMessage(createErrorMessage('Unauthorized: Token session mismatch'))
            );
            ws.close();
            return;
          }
        }
      }

      // Create session if it doesn't exist (auto-create on connect)
      if (!sessionManager.hasSession(sessionName)) {
        try {
          const basePath = config.base_path;
          await sessionManager.createSession({
            name: sessionName,
            dir: process.cwd(),
            path: `${basePath}/${sessionName}`
          });
        } catch {
          ws.send(serializeServerMessage(createErrorMessage('Failed to create session')));
          ws.close();
          return;
        }
      }

      const session = sessionManager.getSession(sessionName);
      if (!session) {
        ws.send(serializeServerMessage(createErrorMessage('Session not found')));
        ws.close();
        return;
      }

      // Add client to session — cast to match existing NativeTerminalWebSocket interface
      session.addClient(ws.raw as unknown as NativeTerminalWebSocket);
    },

    message(ws, message) {
      const sessionName = ws.data.params.sessionName;
      const sessionManager = ws.data.sessionManager;

      const session = sessionManager.getSession(sessionName);
      if (!session) {
        ws.send(serializeServerMessage(createErrorMessage('Session not found')));
        return;
      }

      // Elysia validates and auto-parses the message via TypeBox body schema.
      // Pass the already-validated object directly to avoid double-parse.
      session.handleMessage(ws.raw as unknown as NativeTerminalWebSocket, message);
    },

    close(ws) {
      const sessionName = ws.data.params.sessionName;
      const sessionManager = ws.data.sessionManager;

      sessionManager.handleWebSocketClose(
        sessionName,
        ws.raw as unknown as NativeTerminalWebSocket
      );
    }
  });
};
