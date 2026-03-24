/**
 * Eden Treaty Client
 *
 * Type-safe API client generated from Elysia app type.
 * No manual schema definitions needed — types are inferred from server routes.
 */

import { treaty } from '@elysiajs/eden';
import type { Config } from '@/core/config/types.js';
import type { App } from '@/core/server/elysia/app.js';
import { getDaemonUrl } from './daemon-url.js';

/**
 * Cache for Eden Treaty client instances (one per base URL).
 */
const clientCache = new Map<string, ReturnType<typeof treaty<App>>>();

/**
 * Create or retrieve a cached Eden Treaty client for the bunterm daemon API.
 */
export function createClient(baseUrl: string) {
  let client = clientCache.get(baseUrl);
  if (!client) {
    client = treaty<App>(baseUrl);
    clientCache.set(baseUrl, client);
  }
  return client;
}

export type BuntermClient = ReturnType<typeof createClient>;

/**
 * Extract data from an Eden response, throwing on error or null data.
 */
function unwrap<T>(response: { data: T; error: unknown }): NonNullable<T> {
  if (response.error) {
    const err = response.error as { value?: { message?: string } };
    const message = err.value?.message ?? 'Request failed';
    throw new Error(message);
  }
  if (response.data == null) {
    throw new Error('Request returned no data');
  }
  return response.data as NonNullable<T>;
}

/**
 * Get daemon status
 */
export async function getStatus(config: Config) {
  const client = createClient(getDaemonUrl(config));
  const response = await client.api.status.get();
  return unwrap(response);
}

/**
 * Get all sessions
 */
export async function getSessions(config: Config) {
  const client = createClient(getDaemonUrl(config));
  const response = await client.api.sessions.get();
  return unwrap(response);
}

/**
 * Start a new session
 */
export async function startSession(
  config: Config,
  request: { name: string; dir?: string; tmuxSession?: string }
) {
  const client = createClient(getDaemonUrl(config));
  const response = await client.api.sessions.post(request);
  return unwrap(response);
}

/**
 * Stop a session
 */
export async function stopSession(config: Config, name: string): Promise<void> {
  const client = createClient(getDaemonUrl(config));
  const response = await client.api.sessions({ name }).delete();
  unwrap(response);
}

/**
 * Request daemon shutdown
 *
 * Falls back to raw fetch since shutdown may not be in the Elysia app yet.
 */
export async function requestShutdown(
  config: Config,
  options?: { stopSessions?: boolean; killTmux?: boolean }
): Promise<void> {
  const baseUrl = getDaemonUrl(config);
  try {
    await fetch(`${baseUrl}/api/shutdown`, {
      method: 'POST',
      headers: options ? { 'Content-Type': 'application/json' } : undefined,
      body: options ? JSON.stringify(options) : undefined
    });
  } catch {
    // Server will shut down, so connection may be lost
  }
}

/**
 * Get tmux sessions
 */
export async function getTmuxSessions(config: Config) {
  const client = createClient(getDaemonUrl(config));
  const response = await client.api.tmux.sessions.get();
  return unwrap(response);
}
