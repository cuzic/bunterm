/**
 * Core Context Plugin (Elysia)
 *
 * Shared context plugin that provides typed sessionManager and config
 * to all route plugins, eliminating unsafe store casts.
 *
 * Usage: .use(coreContext) in each plugin instead of manual .derive() blocks.
 */

import { Elysia } from 'elysia';
import type { Config } from '@/core/config/types.js';
import type { CookieSessionStore } from '@/core/server/auth/cookie-session.js';
import type { OtpManager } from '@/core/server/auth/otp-manager.js';
import type { NativeSessionManager } from '@/core/server/session-manager.js';
import type { CommandExecutorManager } from '@/core/terminal/command-executor-manager.js';
import type { AgentTimelineService } from '@/features/agent-timeline/server/timeline-service.js';
import type { BlockEventEmitter } from '@/features/blocks/server/block-event-emitter.js';
import type { ShareManager } from '@/features/share/server/share-manager.js';

/** Function type for rendering the agent timeline HTML page */
export type TimelineHtmlRenderer = (basePath: string, nonce: string) => string;

export const coreContext = new Elysia({ name: 'core-context' })
  .state('sessionManager', null as unknown as NativeSessionManager)
  .state('config', null as unknown as Config)
  .state('timelineService', null as null | AgentTimelineService)
  .state('executorManager', null as null | CommandExecutorManager)
  .state('blockEventEmitter', null as null | BlockEventEmitter)
  .state('cookieSessionStore', null as null | CookieSessionStore)
  .state('shareManager', null as null | ShareManager)
  .state('otpManager', null as null | OtpManager)
  .state('generateTimelineHtml', null as null | TimelineHtmlRenderer)
  .derive(({ store }) => ({
    sessionManager: store.sessionManager,
    config: store.config,
    timelineService: store.timelineService,
    executorManager: store.executorManager,
    blockEventEmitter: store.blockEventEmitter,
    cookieSessionStore: store.cookieSessionStore,
    shareManager: store.shareManager,
    otpManager: store.otpManager,
    generateTimelineHtml: store.generateTimelineHtml
  }))
  .as('global');
