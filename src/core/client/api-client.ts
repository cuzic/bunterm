import { z, type ZodSchema } from 'zod';
import {
  type Config,
  type SessionResponse,
  SessionResponseSchema,
  type StartSessionRequest,
  type StatusResponse,
  StatusResponseSchema,
  type TmuxSessionsResponse,
  TmuxSessionsResponseSchema
} from '@/core/config/types.js';
import { buildApiUrl } from './daemon-url.js';

/**
 * Make an API request to the daemon with schema validation
 */
export async function apiRequest<T>(
  config: Config,
  method: string,
  path: string,
  body?: unknown,
  schema?: ZodSchema<T>
): Promise<T> {
  const url = buildApiUrl(config, path);

  const response = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });

  const data: unknown = await response.json();

  if (!response.ok) {
    const errorData = data as { error?: string };
    throw new Error(errorData.error ?? 'Request failed');
  }

  if (schema) {
    const result = schema.safeParse(data);
    if (result.success) {
      return result.data;
    }
    throw new Error(`Invalid response: ${result.error.issues[0]?.message ?? 'validation failed'}`);
  }

  return data as T;
}

/**
 * Get daemon status
 */
export function getStatus(config: Config): Promise<StatusResponse> {
  return apiRequest(config, 'GET', '/api/status', undefined, StatusResponseSchema);
}

/**
 * Get all sessions
 */
export function getSessions(config: Config): Promise<SessionResponse[]> {
  return apiRequest(config, 'GET', '/api/sessions', undefined, z.array(SessionResponseSchema));
}

/**
 * Start a new session
 */
export function startSession(
  config: Config,
  request: StartSessionRequest
): Promise<SessionResponse> {
  return apiRequest(config, 'POST', '/api/sessions', request, SessionResponseSchema);
}

export interface StopSessionOptions {
  killTmux?: boolean;
}

/**
 * Stop a session
 */
export async function stopSession(
  config: Config,
  name: string,
  options?: StopSessionOptions
): Promise<void> {
  const query = options?.killTmux ? '?killTmux=true' : '';
  await apiRequest<{ success: boolean }>(
    config,
    'DELETE',
    `/api/sessions/${encodeURIComponent(name)}${query}`
  );
}

export interface ShutdownOptions {
  stopSessions?: boolean;
  killTmux?: boolean;
}

/**
 * Request daemon shutdown
 */
export async function requestShutdown(config: Config, options?: ShutdownOptions): Promise<void> {
  try {
    await apiRequest<{ success: boolean }>(config, 'POST', '/api/shutdown', options);
  } catch {
    // Server will shut down, so connection may be lost
  }
}

/**
 * Get tmux sessions
 */
export function getTmuxSessions(config: Config): Promise<TmuxSessionsResponse> {
  return apiRequest(config, 'GET', '/api/tmux/sessions', undefined, TmuxSessionsResponseSchema);
}
