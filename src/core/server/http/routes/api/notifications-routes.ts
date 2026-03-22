/**
 * Notifications API Routes
 *
 * Handles push notification subscriptions and bell triggers.
 */

import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { ok, err } from '@/utils/result.js';
import { notFound, validationFailed } from '@/core/errors.js';
import type { PushSubscriptionState } from '@/core/config/types.js';
import {
  addPushSubscription,
  getAllPushSubscriptions,
  getStateDir,
  removePushSubscription
} from '@/core/config/state.js';
import { getPublicVapidKey } from '@/features/notifications/server/vapid.js';
import { createLogger } from '@/utils/logger.js';
import type { RouteDef } from '../../route-types.js';

const log = createLogger('notifications-api');

// === Schemas ===

const SubscribeBodySchema = z.object({
  endpoint: z.string().url('Invalid endpoint URL'),
  keys: z.object({
    p256dh: z.string().min(1, 'p256dh key is required'),
    auth: z.string().min(1, 'auth key is required')
  }),
  sessionName: z.string().optional()
});

const BellBodySchema = z.object({
  sessionName: z.string().min(1, 'sessionName is required')
});

// === Response Types ===

interface VapidKeyResponse {
  publicKey: string;
}

interface BellResponse {
  success: boolean;
  sessionName: string;
  subscriptionCount: number;
}

// === Routes ===

export const notificationsRoutes: RouteDef[] = [
  {
    method: 'GET',
    path: '/api/notifications/vapid-key',
    description: 'Get VAPID public key for push notifications',
    tags: ['notifications'],
    handler: async () => {
      const publicKey = getPublicVapidKey(getStateDir());
      return ok<VapidKeyResponse>({ publicKey });
    }
  },

  {
    method: 'GET',
    path: '/api/notifications/subscriptions',
    description: 'List all push subscriptions',
    tags: ['notifications'],
    handler: async () => {
      const subscriptions = getAllPushSubscriptions();
      return ok(subscriptions);
    }
  },

  {
    method: 'POST',
    path: '/api/notifications/subscribe',
    bodySchema: SubscribeBodySchema,
    description: 'Create or return existing push subscription',
    tags: ['notifications'],
    handler: async (ctx) => {
      const body = ctx.body as z.infer<typeof SubscribeBodySchema>;

      // Check if subscription already exists
      const existing = getAllPushSubscriptions().find((s) => s.endpoint === body.endpoint);
      if (existing) {
        return ok(existing);
      }

      // Create new subscription
      const subscription: PushSubscriptionState = {
        id: randomBytes(8).toString('hex'),
        endpoint: body.endpoint,
        keys: body.keys,
        sessionName: body.sessionName,
        createdAt: new Date().toISOString()
      };

      addPushSubscription(subscription);
      log.info(`New subscription: ${subscription.id}`);

      return ok(subscription);
    }
  },

  {
    method: 'DELETE',
    path: '/api/notifications/subscribe/:id',
    description: 'Delete a push subscription',
    tags: ['notifications'],
    handler: async (ctx) => {
      const id = ctx.pathParams['id'];
      if (!id) {
        return err(validationFailed('id', 'Subscription ID is required'));
      }

      const existing = getAllPushSubscriptions().find((s) => s.id === id);
      if (!existing) {
        return err(notFound(`Subscription ${id}`));
      }

      removePushSubscription(id);
      log.info(`Subscription removed: ${id}`);

      return ok({ success: true });
    }
  },

  {
    method: 'POST',
    path: '/api/notifications/bell',
    bodySchema: BellBodySchema,
    description: 'Trigger bell notification for a session',
    tags: ['notifications'],
    handler: async (ctx) => {
      const { sessionName } = ctx.body as z.infer<typeof BellBodySchema>;

      const subscriptions = getAllPushSubscriptions().filter(
        (s) => !s.sessionName || s.sessionName === sessionName
      );

      if (subscriptions.length === 0) {
        return ok({ sent: 0, message: 'No subscriptions' });
      }

      log.info(`Bell triggered for session: ${sessionName}`);

      return ok<BellResponse>({
        success: true,
        sessionName,
        subscriptionCount: subscriptions.length
      });
    }
  }
];

// === Legacy Handler (deprecated) ===

/**
 * @deprecated Use notificationsRoutes with RouteRegistry instead
 */
export async function handleNotificationsRoutes(): Promise<Response | null> {
  return null;
}
