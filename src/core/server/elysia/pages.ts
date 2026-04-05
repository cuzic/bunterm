/**
 * Page Routes (Elysia)
 *
 * Handles HTML page rendering: portal, terminal sessions, share pages, agent timeline.
 * Replaces the old page-routes.ts handlePageRoutes function.
 */

import { randomBytes } from 'node:crypto';
import { Elysia, t } from 'elysia';
import { generateNativeTerminalHtml } from '@/core/server/html-template.js';
import { generatePortalHtml } from '@/core/server/portal.js';
import { createLogger } from '@/utils/logger.js';
import { coreContext } from './context.js';

const log = createLogger('pages-elysia');


/**
 * Generate a cryptographically random nonce for CSP.
 * Returns a base64-encoded 16-byte random value.
 */
function generateNonce(): string {
  return randomBytes(16).toString('base64');
}

// === Plugin ===

export const pagesPlugin = new Elysia()
  .use(coreContext)

  // GET /basePath/ - Portal page
  .get(
    '/',
    ({ sessionManager, config, store }) => {
      const nonce = generateNonce();
      store.cspNonce = nonce;
      const sessions = sessionManager.listSessions().map((s) => ({
        name: s.name,
        pid: s.pid,
        port: 0,
        path: `/${s.name}`,
        dir: s.dir,
        started_at: s.startedAt
      }));
      const html = generatePortalHtml(config, sessions, nonce);
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    },
    {}
  )

  // GET /basePath/agents - Agent timeline page
  .get(
    '/agents',
    ({ store, generateTimelineHtml }) => {
      if (!generateTimelineHtml) {
        return new Response('Agent timeline not available', {
          status: 404,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
      const nonce = generateNonce();
      store.cspNonce = nonce;
      const html = generateTimelineHtml('', nonce);
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    },
    {}
  )

  // GET /basePath/share/:token - Share page
  .get(
    '/share/:token',
    ({ sessionManager, config, params, set, store, shareManager }) => {
      const token = decodeURIComponent(params.token);
      const share = shareManager?.validateShare(token);

      if (!share) {
        set.status = 404;
        return new Response('Share link not found or expired', {
          status: 404,
          headers: { 'Content-Type': 'text/plain' }
        });
      }

      const sessionName = share.sessionName;
      if (!sessionManager.hasSession(sessionName)) {
        set.status = 404;
        return new Response('Session not found', {
          status: 404,
          headers: { 'Content-Type': 'text/plain' }
        });
      }

      const nonce = generateNonce();
      store.cspNonce = nonce;

      const basePath = config.base_path;
      const html = generateNativeTerminalHtml({
        sessionName,
        basePath,
        sessionPath: `${basePath}/${sessionName}`,
        config,
        isShared: true,
        nonce
      });
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    },
    {
      params: t.Object({ token: t.String() })
    }
  )

  // GET /basePath/:sessionName - Terminal session page
  .get(
    '/:sessionName',
    async ({ sessionManager, config, params, set, store }) => {
      const sessionName = params.sessionName;
      const basePath = config.base_path;

      let session = sessionManager.getSession(sessionName);

      // If session doesn't exist, try to create it
      if (!session) {
        try {
          session = await sessionManager.createSession({
            name: sessionName,
            dir: process.cwd(),
            path: `${basePath}/${sessionName}`
          });
          log.info(`Created session on demand: ${sessionName}`);
        } catch (error) {
          log.error(`Failed to create session ${sessionName}: ${error}`);
          set.status = 500;
          return new Response('Failed to create session', {
            status: 500,
            headers: { 'Content-Type': 'text/plain' }
          });
        }
      }

      const nonce = generateNonce();
      store.cspNonce = nonce;

      const html = generateNativeTerminalHtml({
        sessionName,
        basePath,
        sessionPath: `${basePath}/${sessionName}`,
        config,
        nonce
      });
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    },
    {
      params: t.Object({ sessionName: t.String() })
    }
  );
