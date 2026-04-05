import { swagger } from '@elysiajs/swagger';
import { type AnyElysia, Elysia } from 'elysia';
import type { Config } from '@/core/config/types.js';
import type { CookieSessionStore } from '@/core/server/auth/cookie-session.js';
import type { OtpManager } from '@/core/server/auth/otp-manager.js';
import type { NativeSessionManager } from '@/core/server/session-manager.js';
import type { CommandExecutorManager } from '@/core/terminal/command-executor-manager.js';
import type { AgentTimelineService } from '@/features/agent-timeline/server/timeline-service.js';
import type { BlockEventEmitter } from '@/features/blocks/server/block-event-emitter.js';
import type { ShareManager } from '@/features/share/server/share-manager.js';
import { authRoutesPlugin } from './auth.js';
import { authSessionsPlugin } from './auth-sessions.js';
import { clipboardPlugin } from './clipboard.js';
import type { TimelineHtmlRenderer } from './context.js';
import { filesPlugin } from './files.js';
import { authPlugin } from './middleware/auth.js';
import { securityHeadersPlugin } from './middleware/security-headers.js';
import { osc633Plugin } from './osc633.js';
import { pagesPlugin } from './pages.js';
import { previewFilePlugin, previewPlugin } from './preview.js';
import { sessionsPlugin } from './sessions.js';
import { staticFilesPlugin } from './static-files.js';
import { systemPlugin } from './system.js';
import { websocketPlugin } from './websocket.js';

export interface ElysiaAppDeps {
  sessionManager: NativeSessionManager;
  config: Config;
  timelineService?: AgentTimelineService | null;
  executorManager?: CommandExecutorManager | null;
  blockEventEmitter?: BlockEventEmitter | null;
  cookieSessionStore?: CookieSessionStore | null;
  shareManager?: ShareManager | null;
  otpManager?: OtpManager | null;
  /** Timeline HTML renderer (injected from bootstrap) */
  generateTimelineHtml?: TimelineHtmlRenderer | null;
  /** Feature plugins registered by the bootstrap layer */
  featurePlugins?: AnyElysia[];
}

export function createElysiaApp(deps: ElysiaAppDeps) {
  const app = new Elysia()
    .use(securityHeadersPlugin)
    .use(authPlugin)
    .use(
      swagger({
        path: '/api/swagger',
        documentation: {
          info: {
            title: 'bunterm API',
            version: '1.0.0',
            description: 'Browser-based terminal manager'
          },
          tags: [
            { name: 'sessions', description: 'Session management' },
            { name: 'agents', description: 'Agent timeline' },
            { name: 'ai', description: 'AI chat' },
            { name: 'blocks', description: 'Command blocks' },
            { name: 'files', description: 'File operations' },
            { name: 'notifications', description: 'Push notifications' },
            { name: 'shares', description: 'Session sharing' },
            { name: 'auth', description: 'Authentication' }
          ]
        }
      })
    )
    .state('sessionManager', deps.sessionManager)
    .state('config', deps.config)
    .state('timelineService', deps.timelineService ?? null)
    .state('executorManager', deps.executorManager ?? null)
    .state('blockEventEmitter', deps.blockEventEmitter ?? null)
    .state('cookieSessionStore', deps.cookieSessionStore ?? null)
    .state('shareManager', deps.shareManager ?? null)
    .state('otpManager', deps.otpManager ?? null)
    .state('generateTimelineHtml', deps.generateTimelineHtml ?? null)
    .use(systemPlugin)
    .use(sessionsPlugin)
    .use(clipboardPlugin)
    .use(osc633Plugin)
    .use(filesPlugin)
    .use(previewPlugin)
    .use(authRoutesPlugin)
    .use(authSessionsPlugin)
    .use(staticFilesPlugin)
    .use(previewFilePlugin)
    .use(websocketPlugin())
    .use(pagesPlugin);

  // Register feature plugins from bootstrap layer
  for (const plugin of deps.featurePlugins ?? []) {
    app.use(plugin);
  }

  return app;
}

export type App = ReturnType<typeof createElysiaApp>;
