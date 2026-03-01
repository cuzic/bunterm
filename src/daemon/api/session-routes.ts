/**
 * Session management API routes
 *
 * Handles: /api/status, /api/sessions, /api/shutdown
 */

import { getFullPath } from '@/config/config.js';
import { getDaemonState } from '@/config/state.js';
import { getErrorMessage } from '@/utils/errors.js';
import { isValidSessionName, sanitizeSessionName } from '@/utils/tmux-client.js';
import { MAX_JSON_BODY_SIZE, readBodyWithLimit, sendJson } from '../http-utils.js';
import {
  type StartSessionOptions,
  allocatePort,
  sessionManager,
  sessionNameFromDir
} from '../session-manager.js';
import type { RouteContext, RouteHandler } from './types.js';

/** Regex to match DELETE /api/sessions/:name */
const DELETE_SESSION_REGEX = /^\/api\/sessions\/(.+)$/;

/**
 * Session routes handler
 */
export const handleSessionRoutes: RouteHandler = (ctx: RouteContext): boolean => {
  const { config, req, res, path, method } = ctx;

  // GET /api/status
  if (path === '/api/status' && method === 'GET') {
    const daemon = getDaemonState();
    const sessions = sessionManager.listSessions().map((s) => ({
      ...s,
      fullPath: getFullPath(config, s.path)
    }));
    sendJson(res, 200, { daemon, sessions });
    return true;
  }

  // GET /api/sessions
  if (path === '/api/sessions' && method === 'GET') {
    const sessions = sessionManager.listSessions().map((s) => ({
      ...s,
      fullPath: getFullPath(config, s.path)
    }));
    sendJson(res, 200, sessions);
    return true;
  }

  // POST /api/sessions
  if (path === '/api/sessions' && method === 'POST') {
    readBodyWithLimit(req, MAX_JSON_BODY_SIZE)
      .then(async (body) => {
        const parsed = JSON.parse(body) as {
          name?: string;
          dir: string;
          path?: string;
        };
        const rawName = parsed.name ?? sessionNameFromDir(parsed.dir);
        // Sanitize session name to prevent command injection
        const name = isValidSessionName(rawName) ? rawName : sanitizeSessionName(rawName);

        // Re-validate after sanitization to ensure safety
        if (!isValidSessionName(name)) {
          sendJson(res, 400, { error: 'Invalid session name after sanitization' });
          return;
        }

        const sessionPath = parsed.path ?? `/${name}`;
        const port = allocatePort(config);
        const fullPath = getFullPath(config, sessionPath);

        const options: StartSessionOptions = {
          name,
          dir: parsed.dir,
          path: sessionPath,
          port,
          fullPath,
          tmuxMode: config.tmux_mode
        };

        const session = await sessionManager.startSession(options);
        sendJson(res, 201, { ...session, fullPath });
      })
      .catch((error) => {
        sendJson(res, 400, { error: getErrorMessage(error) });
      });
    return true;
  }

  // DELETE /api/sessions/:name?killTmux=true
  const deleteMatch = path.match(DELETE_SESSION_REGEX);
  if (deleteMatch?.[1] && method === 'DELETE') {
    const [pathPart = '', queryString] = deleteMatch[1].split('?');
    const name = decodeURIComponent(pathPart);
    const params = new URLSearchParams(queryString ?? '');
    const killTmux = params.get('killTmux') === 'true';
    try {
      sessionManager.stopSession(name, { killTmux });
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 400, { error: getErrorMessage(error) });
    }
    return true;
  }

  // POST /api/shutdown
  if (path === '/api/shutdown' && method === 'POST') {
    readBodyWithLimit(req, MAX_JSON_BODY_SIZE)
      .then((body) => {
        const options = body
          ? (JSON.parse(body) as { stopSessions?: boolean; killTmux?: boolean })
          : {};
        if (options.stopSessions) {
          sessionManager.stopAllSessions({ killTmux: options.killTmux });
        }
        sendJson(res, 200, { success: true });
        setTimeout(() => {
          process.exit(0);
        }, 100);
      })
      .catch((error) => {
        sendJson(res, 400, { error: getErrorMessage(error) });
      });
    return true;
  }

  return false;
};
