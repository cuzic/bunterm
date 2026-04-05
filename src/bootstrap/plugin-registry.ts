/**
 * Plugin Registry — Bootstrap layer
 *
 * Registers feature Elysia plugins so that core/server/elysia/app.ts
 * does not need to import from features/ directly.
 */

import type { AnyElysia } from 'elysia';
import { agentsPlugin } from '@/features/agent-timeline/server/elysia-plugin.js';
import { aiPlugin } from '@/features/ai/server/elysia-plugin.js';
import { blocksPlugin } from '@/features/blocks/server/elysia-plugin.js';
import { claudeQuotesPlugin } from '@/features/ai/server/elysia-quotes-plugin.js';
import { notificationsPlugin } from '@/features/notifications/server/elysia-plugin.js';
import { sharesPlugin } from '@/features/share/server/elysia-plugin.js';

/**
 * Return all feature Elysia plugins to be registered in the app.
 */
export function getFeaturePlugins(): AnyElysia[] {
  return [
    agentsPlugin,
    blocksPlugin,
    aiPlugin,
    claudeQuotesPlugin,
    notificationsPlugin,
    sharesPlugin
  ];
}
