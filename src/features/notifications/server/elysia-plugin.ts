/**
 * Notifications API Routes (Elysia)
 *
 * Handles push notification subscriptions and bell triggers.
 * Replaces the old notifications-routes.ts with Elysia's TypeBox validation.
 */

import { randomBytes } from 'node:crypto';
import { Elysia, t } from 'elysia';
import {
  addPushSubscription,
  getAllPushSubscriptions,
  getStateDir,
  removePushSubscription
} from '@/core/config/state.js';
import type { PushSubscriptionState } from '@/core/config/types.js';
import { coreContext } from '@/core/server/elysia/context.js';
import { ErrorResponseSchema } from '@/core/server/elysia/errors.js';
import { getPublicVapidKey } from '@/features/notifications/server/vapid.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('notifications-api');

// === Response Schemas ===

const PushSubscriptionKeysSchema = t.Object({
  p256dh: t.String(),
  auth: t.String()
});

const PushSubscriptionSchema = t.Object({
  id: t.String(),
  endpoint: t.String(),
  keys: PushSubscriptionKeysSchema,
  sessionName: t.Optional(t.String()),
  createdAt: t.String()
});

const VapidKeyResponseSchema = t.Object({
  publicKey: t.String()
});

const BellResponseSchema = t.Object({
  success: t.Boolean(),
  sessionName: t.String(),
  subscriptionCount: t.Number()
});

const SuccessResponseSchema = t.Object({
  success: t.Boolean()
});

// === Plugin ===

export const notificationsPlugin = new Elysia({ prefix: '/api' })
  .use(coreContext)

  // GET /api/notifications/vapid-key
  .get(
    '/notifications/vapid-key',
    () => {
      const publicKey = getPublicVapidKey(getStateDir());
      return { publicKey };
    },
    { response: VapidKeyResponseSchema }
  )

  // GET /api/notifications/subscriptions
  .get(
    '/notifications/subscriptions',
    () => {
      return getAllPushSubscriptions();
    },
    { response: t.Array(PushSubscriptionSchema) }
  )

  // POST /api/notifications/subscribe
  .post(
    '/notifications/subscribe',
    ({ body }) => {
      // Check if subscription already exists
      const existing = getAllPushSubscriptions().find((s) => s.endpoint === body.endpoint);
      if (existing) {
        return existing;
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

      return subscription;
    },
    {
      body: t.Object({
        endpoint: t.String({ format: 'uri' }),
        keys: t.Object({
          p256dh: t.String({ minLength: 1 }),
          auth: t.String({ minLength: 1 })
        }),
        sessionName: t.Optional(t.String())
      }),
      response: PushSubscriptionSchema
    }
  )

  // DELETE /api/notifications/subscribe/:id
  .delete(
    '/notifications/subscribe/:id',
    ({ params, error }) => {
      const existing = getAllPushSubscriptions().find((s) => s.id === params.id);
      if (!existing) {
        return error(404, { error: 'NOT_FOUND', message: `Subscription ${params.id} not found` });
      }

      removePushSubscription(params.id);
      log.info(`Subscription removed: ${params.id}`);

      return { success: true };
    },
    {
      params: t.Object({ id: t.String() }),
      response: {
        200: SuccessResponseSchema,
        404: ErrorResponseSchema
      }
    }
  )

  // POST /api/notifications/bell
  .post(
    '/notifications/bell',
    ({ body }) => {
      const { sessionName } = body;

      const subscriptions = getAllPushSubscriptions().filter(
        (s) => !s.sessionName || s.sessionName === sessionName
      );

      if (subscriptions.length === 0) {
        return { success: true, sessionName, subscriptionCount: 0 };
      }

      log.info(`Bell triggered for session: ${sessionName}`);

      return {
        success: true,
        sessionName,
        subscriptionCount: subscriptions.length
      };
    },
    {
      body: t.Object({
        sessionName: t.String({ minLength: 1 })
      }),
      response: BellResponseSchema
    }
  );
