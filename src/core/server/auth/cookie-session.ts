/**
 * Cookie Session Management
 *
 * In-memory cookie session store with creation, validation, revocation,
 * and cleanup. Includes helpers for parsing and building Cookie headers.
 */

import { randomBytes } from 'node:crypto';

// === Types ===

export interface CookieSession {
  /** Session ID (hex string) */
  id: string;
  /** Created timestamp (ms since epoch) */
  createdAt: number;
  /** Expiration timestamp (ms since epoch) */
  expiresAt: number;
  /** Remote IP address of the client that created this session */
  remoteAddr: string;
}

export interface CookieSessionStore {
  /** Create a new session with the given TTL in seconds */
  create(ttlSeconds: number, remoteAddr?: string): CookieSession;
  /** Validate a session ID (exists and not expired) */
  validate(sessionId: string): boolean;
  /** Revoke (delete) a session */
  revoke(sessionId: string): void;
  /** Remove expired sessions, return count removed */
  cleanup(): number;
  /** List all valid (non-expired) sessions */
  listSessions(): CookieSession[];
}

export interface SetCookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  path?: string;
  maxAge?: number;
}

// === InMemoryCookieSessionStore ===

export class InMemoryCookieSessionStore implements CookieSessionStore {
  private readonly sessions = new Map<string, CookieSession>();

  create(ttlSeconds: number, remoteAddr = 'unknown'): CookieSession {
    const now = Date.now();
    const session: CookieSession = {
      id: randomBytes(32).toString('hex'),
      createdAt: now,
      expiresAt: now + ttlSeconds * 1000,
      remoteAddr
    };
    this.sessions.set(session.id, session);
    return session;
  }

  validate(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(sessionId);
      return false;
    }
    return true;
  }

  revoke(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) {
        this.sessions.delete(id);
        removed++;
      }
    }
    return removed;
  }

  listSessions(): CookieSession[] {
    const now = Date.now();
    const valid: CookieSession[] = [];
    for (const session of this.sessions.values()) {
      if (session.expiresAt > now) {
        valid.push(session);
      }
    }
    return valid;
  }

  /** Number of stored sessions (for testing/monitoring) */
  get size(): number {
    return this.sessions.size;
  }
}

// === Cookie Helpers ===

export function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) {
    return cookies;
  }

  for (const pair of cookieHeader.split(';')) {
    const eqIndex = pair.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }
    const name = pair.slice(0, eqIndex).trim();
    const value = pair.slice(eqIndex + 1).trim();
    if (name) {
      cookies[name] = value;
    }
  }

  return cookies;
}

export function buildSetCookieHeader(
  name: string,
  value: string,
  options: SetCookieOptions
): string {
  const parts = [`${name}=${value}`];

  if (options.path !== undefined) {
    parts.push(`Path=${options.path}`);
  }
  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }
  if (options.httpOnly) {
    parts.push('HttpOnly');
  }
  if (options.secure) {
    parts.push('Secure');
  }
  if (options.sameSite !== undefined) {
    parts.push(`SameSite=${options.sameSite}`);
  }

  return parts.join('; ');
}

export function clearCookieHeader(name: string, path: string): string {
  return buildSetCookieHeader(name, '', {
    path,
    maxAge: 0
  });
}

export function extractSessionCookie(req: Request, cookieName: string): string | null {
  const cookieHeader = req.headers.get('Cookie');
  if (!cookieHeader) {
    return null;
  }
  const cookies = parseCookies(cookieHeader);
  return cookies[cookieName] ?? null;
}
