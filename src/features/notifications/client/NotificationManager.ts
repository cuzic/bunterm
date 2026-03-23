/**
 * Notification Manager
 *
 * Handles Web Push notification subscription and management.
 */

import { z } from 'zod';
import type { TerminalUiConfig } from '@/browser/shared/types.js';
import { STORAGE_KEYS } from '@/browser/shared/types.js';
import { getSessionNameFromURL } from '@/browser/shared/utils.js';
import { createApiClient, type ToolbarApiClient } from '@/browser/toolbar/ApiClient.js';
import { createStorageManager, type StorageManager } from '@/browser/toolbar/StorageManager.js';

// Schema for notification subscription storage
const subscriptionSchema = z
  .object({
    id: z.string()
  })
  .nullable();

type SubscriptionData = { id: string } | null;

export class NotificationManager {
  private config: TerminalUiConfig;
  private apiClient: ToolbarApiClient;
  private subscribed = false;
  private subscriptionId: string | null = null;
  private notifyBtn: HTMLElement | null = null;
  private storage: StorageManager<SubscriptionData>;

  constructor(config: TerminalUiConfig) {
    this.config = config;
    this.apiClient = createApiClient({ basePath: config.base_path });
    this.storage = createStorageManager({
      key: STORAGE_KEYS.NOTIFY_SUBSCRIPTION,
      schema: subscriptionSchema,
      defaultValue: null
    });
    this.loadSubscription();
  }

  /**
   * Bind notification button element
   */
  bindElement(notifyBtn: HTMLElement): void {
    this.notifyBtn = notifyBtn;
    this.updateButton();
  }

  /**
   * Get session name from config or URL
   */
  private getSessionName(): string {
    // Use sessionName from config if available (server-provided), otherwise extract from URL
    return this.config.sessionName || getSessionNameFromURL(this.config.base_path);
  }

  /**
   * Convert base64 to Uint8Array for applicationServerKey
   */
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  /**
   * Load saved subscription ID from storage
   */
  private loadSubscription(): void {
    const data = this.storage.load();
    if (data) {
      this.subscriptionId = data.id;
      this.subscribed = true;
    }
  }

  /**
   * Save subscription ID to storage
   */
  private saveSubscription(id: string): void {
    this.storage.save({ id });
  }

  /**
   * Clear subscription from storage
   */
  private clearSubscription(): void {
    this.storage.clear();
  }

  /**
   * Update button appearance based on subscription state
   */
  updateButton(): void {
    if (!this.notifyBtn) {
      return;
    }

    if (this.subscribed) {
      this.notifyBtn.classList.add('active');
      this.notifyBtn.textContent = '\u{1F514}'; // 🔔
      this.notifyBtn.title = 'Push通知: ON (クリックで解除)';
    } else {
      this.notifyBtn.classList.remove('active');
      this.notifyBtn.textContent = '\u{1F515}'; // 🔕
      this.notifyBtn.title = 'Push通知: OFF (クリックで有効化)';
    }
  }

  /**
   * Check if subscribed
   */
  isSubscribed(): boolean {
    return this.subscribed;
  }

  /**
   * Subscribe to push notifications
   */
  async subscribe(): Promise<void> {
    const sessionName = this.getSessionName();

    try {
      // Check if service worker is supported
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        alert('このブラウザはPush通知をサポートしていません');
        return;
      }

      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert('通知の許可が必要です');
        return;
      }

      // Get VAPID public key from server
      const publicKey = await this.apiClient.getVapidKey();

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(publicKey) as BufferSource
      });

      // Extract keys
      const p256dh = subscription.getKey('p256dh');
      const auth = subscription.getKey('auth');

      if (!p256dh || !auth) {
        throw new Error('Failed to get subscription keys');
      }

      // Send subscription to server
      const subscriptionId = await this.apiClient.subscribe({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(p256dh)))),
          auth: btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(auth))))
        },
        sessionName: sessionName || undefined
      });

      this.subscriptionId = subscriptionId;
      this.subscribed = true;
      this.saveSubscription(subscriptionId);
      this.updateButton();
    } catch (error) {
      alert(`Push通知の登録に失敗しました: ${(error as Error).message}`);
    }
  }

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribe(): Promise<void> {
    try {
      if (this.subscriptionId) {
        await this.apiClient.unsubscribe(this.subscriptionId);
      }

      // Also unsubscribe from browser
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
      }

      this.subscribed = false;
      this.subscriptionId = null;
      this.clearSubscription();
      this.updateButton();
    } catch (_error) {}
  }

  /**
   * Toggle notification subscription
   */
  async toggle(): Promise<void> {
    if (this.subscribed) {
      await this.unsubscribe();
    } else {
      await this.subscribe();
    }
  }

  /**
   * Show a toast notification message
   * @param message The message to display
   * @param type The type of toast ('info' | 'error' | 'success')
   */
  showToast(message: string, type: 'info' | 'error' | 'success' = 'info'): void {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `tui-toast tui-toast-${type}`;
    toast.textContent = message;

    // Create container if not exists
    let container = document.getElementById('tui-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'tui-toast-container';
      document.body.appendChild(container);
    }

    // Add toast
    container.appendChild(toast);

    // Show with animation
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    // Auto-remove after 5 seconds
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        toast.remove();
        // Remove container if empty
        if (container && container.children.length === 0) {
          container.remove();
        }
      }, 300);
    }, 5000);
  }
}
