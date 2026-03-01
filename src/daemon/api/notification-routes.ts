/**
 * Push notification API routes
 *
 * Handles: /api/notifications/*
 */

import {
  addPushSubscription,
  getAllPushSubscriptions,
  getStateDir,
  removePushSubscription
} from '@/config/state.js';
import { getErrorMessage } from '@/utils/errors.js';
import { createLogger } from '@/utils/logger.js';
import { MAX_JSON_BODY_SIZE, readBodyWithLimit, sendJson } from '../http-utils.js';
import { createSubscriptionManager } from '../notification/subscription.js';
import { getPublicVapidKey } from '../notification/vapid.js';
import { getNotificationService } from '../ws-proxy.js';
import type { RouteContext, RouteHandler } from './types.js';

const log = createLogger('api-notification');

// Create SubscriptionManager for push notifications
const subscriptionManager = createSubscriptionManager({
  getSubscriptions: () =>
    getAllPushSubscriptions().map((s) => ({
      id: s.id,
      endpoint: s.endpoint,
      keys: s.keys,
      sessionName: s.sessionName,
      createdAt: s.createdAt
    })),
  addSubscription: (subscription) => {
    addPushSubscription({
      id: subscription.id,
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      sessionName: subscription.sessionName,
      createdAt: subscription.createdAt
    });
  },
  removeSubscription: (id) => removePushSubscription(id)
});

/**
 * Notification routes handler
 */
export const handleNotificationRoutes: RouteHandler = (ctx: RouteContext): boolean => {
  const { req, res, path, method } = ctx;

  // GET /api/notifications/vapid-key - Get public VAPID key
  if (path === '/api/notifications/vapid-key' && method === 'GET') {
    try {
      const publicKey = getPublicVapidKey(getStateDir());
      sendJson(res, 200, { publicKey });
    } catch (error) {
      sendJson(res, 500, { error: getErrorMessage(error) });
    }
    return true;
  }

  // POST /api/notifications/subscribe - Subscribe to push notifications
  if (path === '/api/notifications/subscribe' && method === 'POST') {
    readBodyWithLimit(req, MAX_JSON_BODY_SIZE)
      .then((body) => {
        const parsed = JSON.parse(body) as {
          endpoint: string;
          keys: { p256dh: string; auth: string };
          sessionName?: string;
        };

        if (!parsed.endpoint || !parsed.keys?.p256dh || !parsed.keys?.auth) {
          sendJson(res, 400, { error: 'Invalid subscription data' });
          return;
        }

        // Validate endpoint is a valid HTTPS URL (security requirement for web push)
        try {
          const endpointUrl = new URL(parsed.endpoint);
          if (endpointUrl.protocol !== 'https:') {
            sendJson(res, 400, { error: 'Endpoint must be HTTPS' });
            return;
          }
        } catch {
          sendJson(res, 400, { error: 'Invalid endpoint URL' });
          return;
        }

        const subscription = subscriptionManager.subscribe(
          parsed.endpoint,
          parsed.keys,
          parsed.sessionName
        );
        sendJson(res, 201, subscription);
      })
      .catch((error) => {
        sendJson(res, 400, { error: getErrorMessage(error) });
      });
    return true;
  }

  // DELETE /api/notifications/subscribe/:id - Unsubscribe
  if (path.startsWith('/api/notifications/subscribe/') && method === 'DELETE') {
    const id = decodeURIComponent(path.slice('/api/notifications/subscribe/'.length));
    const success = subscriptionManager.unsubscribe(id);
    if (success) {
      sendJson(res, 200, { success: true });
    } else {
      sendJson(res, 404, { error: 'Subscription not found' });
    }
    return true;
  }

  // GET /api/notifications/subscriptions - List subscriptions
  if (path === '/api/notifications/subscriptions' && method === 'GET') {
    const subscriptions = subscriptionManager.getAll();
    sendJson(res, 200, subscriptions);
    return true;
  }

  // POST /api/notifications/bell - Trigger bell notification (from client-side xterm.js onBell)
  if (path === '/api/notifications/bell' && method === 'POST') {
    readBodyWithLimit(req, MAX_JSON_BODY_SIZE)
      .then(async (body) => {
        const parsed = JSON.parse(body) as { sessionName: string };
        const { sessionName } = parsed;

        if (!sessionName) {
          sendJson(res, 400, { error: 'sessionName is required' });
          return;
        }

        const notificationService = getNotificationService();
        if (!notificationService?.isEnabled()) {
          sendJson(res, 200, { success: true, sent: false, reason: 'notifications disabled' });
          return;
        }

        // Trigger bell notification
        log.info(`Bell notification triggered for session: ${sessionName}`);
        await notificationService.processOutput(sessionName, '\x07');
        sendJson(res, 200, { success: true, sent: true });
      })
      .catch((error) => {
        sendJson(res, 400, { error: getErrorMessage(error) });
      });
    return true;
  }

  return false;
};
