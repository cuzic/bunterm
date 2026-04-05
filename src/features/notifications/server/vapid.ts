/**
 * VAPID key management for Web Push
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import webpush from 'web-push';
import type { VapidKeys } from './types.js';

/**
 * Get VAPID keys file path
 */
function getVapidKeysPath(stateDir: string): string {
  return join(stateDir, 'vapid-keys.json');
}

/**
 * Generate new VAPID keys
 */
export function generateVapidKeys(): VapidKeys {
  const keys = webpush.generateVAPIDKeys();
  return {
    publicKey: keys.publicKey,
    privateKey: keys.privateKey
  };
}

/**
 * Load VAPID keys from file, or generate if not exists
 */
export function loadOrGenerateVapidKeys(stateDir: string): VapidKeys {
  const keysPath = getVapidKeysPath(stateDir);

  if (existsSync(keysPath)) {
    try {
      // biome-ignore lint: sync read at startup
      const content = readFileSync(keysPath, 'utf-8');
      return JSON.parse(content) as VapidKeys;
    } catch {
      // Fall through to generate new keys
    }
  }

  // Generate new keys
  const keys = generateVapidKeys();
  saveVapidKeys(stateDir, keys);
  return keys;
}

/**
 * Save VAPID keys to file
 */
export function saveVapidKeys(stateDir: string, keys: VapidKeys): void {
  const keysPath = getVapidKeysPath(stateDir);
  writeFileSync(keysPath, JSON.stringify(keys, null, 2), { mode: 0o600 });
}

/**
 * Get public VAPID key (safe to share with clients)
 */
export function getPublicVapidKey(stateDir: string): string {
  const keys = loadOrGenerateVapidKeys(stateDir);
  return keys.publicKey;
}
