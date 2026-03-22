/**
 * Sessions API Routes
 *
 * Handles session management: list, create, delete sessions.
 */

import { z } from 'zod';
import { ok, err } from '@/utils/result.js';
import { sessionNotFound, sessionAlreadyExists, tmuxNotInstalled, tmuxSessionNotFound, validationFailed } from '@/core/errors.js';
import { createTmuxClient } from '@/utils/tmux-client.js';
import type { RouteDef } from '../../route-types.js';

// === Schemas ===

const CreateSessionBodySchema = z.object({
  name: z.string().min(1, 'Session name is required'),
  dir: z.string().optional(),
  tmuxSession: z.string().optional()
});

type CreateSessionBody = z.infer<typeof CreateSessionBodySchema>;

// === Response Types ===

interface SessionInfo {
  name: string;
  pid: number;
  port: number;
  path: string;
  dir: string;
  started_at: string;
  clients?: number;
  tmuxSession?: string;
}

interface StatusResponse {
  daemon: {
    pid: number;
    port: number;
    backend: string;
  };
  sessions: SessionInfo[];
}

interface TmuxSessionInfo {
  name: string;
  windows: number;
  created: string;
  attached: boolean;
  cwd: string;
}

interface CreateSessionResponse {
  name: string;
  pid: number;
  path: string;
  dir: string;
  tmuxSession?: string;
  existing: boolean;
}

// === Routes ===

export const sessionsRoutes: RouteDef[] = [
  {
    method: 'GET',
    path: '/api/status',
    description: 'Get daemon and session status',
    tags: ['sessions'],
    handler: async (ctx) => {
      const sessions = ctx.sessionManager.listSessions().map((s) => ({
        name: s.name,
        pid: s.pid,
        port: 0,
        path: `/${s.name}`,
        dir: s.dir,
        started_at: s.startedAt,
        clients: s.clientCount
      }));

      return ok<StatusResponse>({
        daemon: {
          pid: process.pid,
          port: ctx.config.daemon_port,
          backend: 'native'
        },
        sessions
      });
    }
  },

  {
    method: 'GET',
    path: '/api/sessions',
    description: 'List all sessions',
    tags: ['sessions'],
    handler: async (ctx) => {
      const sessions = ctx.sessionManager.listSessions().map((s) => ({
        name: s.name,
        pid: s.pid,
        port: 0,
        path: `/${s.name}`,
        dir: s.dir,
        started_at: s.startedAt,
        tmuxSession: s.tmuxSession
      }));
      return ok(sessions);
    }
  },

  {
    method: 'GET',
    path: '/api/tmux/sessions',
    description: 'List tmux sessions',
    tags: ['sessions', 'tmux'],
    handler: async () => {
      const tmuxClient = createTmuxClient();
      const installed = tmuxClient.isInstalled();

      if (!installed) {
        return ok({ sessions: [] as TmuxSessionInfo[], installed: false });
      }

      const tmuxSessions = tmuxClient.listSessions();
      const sessions: TmuxSessionInfo[] = tmuxSessions.map((s) => ({
        name: s.name,
        windows: s.windows,
        created: s.created.toISOString(),
        attached: s.attached,
        cwd: s.cwd ?? ''
      }));

      return ok({ sessions, installed: true });
    }
  },

  {
    method: 'POST',
    path: '/api/sessions',
    bodySchema: CreateSessionBodySchema,
    description: 'Create a new session',
    tags: ['sessions'],
    handler: async (ctx) => {
      const { name, dir, tmuxSession } = ctx.body as CreateSessionBody;

      // If tmuxSession is specified, check for existing wrapper FIRST
      if (tmuxSession) {
        const tmuxClient = createTmuxClient();
        if (!tmuxClient.isInstalled()) {
          return err(tmuxNotInstalled());
        }
        if (!tmuxClient.sessionExists(tmuxSession)) {
          return err(tmuxSessionNotFound(tmuxSession));
        }

        // Check if there's already a bunterm session wrapping this tmux session
        const existingSessionName = ctx.sessionManager.findSessionByTmuxSession(tmuxSession);
        if (existingSessionName) {
          const existingSession = ctx.sessionManager.getSession(existingSessionName);
          if (existingSession) {
            return ok<CreateSessionResponse>({
              name: existingSession.name,
              pid: existingSession.pid ?? 0,
              path: `/${existingSessionName}`,
              dir: existingSession.cwd,
              tmuxSession,
              existing: true
            });
          }
        }
      }

      // Check if session name already exists
      if (ctx.sessionManager.hasSession(name)) {
        return err(sessionAlreadyExists(name));
      }

      const session = await ctx.sessionManager.createSession({
        name,
        dir: dir || process.cwd(),
        path: `${ctx.basePath}/${name}`,
        tmuxSession
      });

      return ok<CreateSessionResponse>({
        name: session.name,
        pid: session.pid ?? 0,
        path: `/${name}`,
        dir: session.cwd,
        tmuxSession,
        existing: false
      });
    }
  },

  {
    method: 'DELETE',
    path: '/api/sessions/:name',
    description: 'Delete a session',
    tags: ['sessions'],
    handler: async (ctx) => {
      const sessionName = ctx.pathParams['name'];
      if (!sessionName) {
        return err(validationFailed('name', 'Session name is required'));
      }

      if (!ctx.sessionManager.hasSession(sessionName)) {
        return err(sessionNotFound(sessionName));
      }

      await ctx.sessionManager.stopSession(sessionName);
      return ok({ success: true });
    }
  }
];

// === Legacy Handler (deprecated) ===

/**
 * @deprecated Use sessionsRoutes with RouteRegistry instead
 */
export async function handleSessionsRoutes(): Promise<Response | null> {
  return null;
}
