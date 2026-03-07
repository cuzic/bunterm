import { normalizeBasePath } from '@/core/config/config.js';
import { getAllSessions, getSession, getSessionByDir } from '@/core/config/state.js';
import type { Config, SessionDefinition, SessionState } from '@/core/config/types.js';

/**
 * Unified session resolution with multiple lookup strategies
 */
export class SessionResolver {
  private readonly config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Find session by name
   */
  byName(name: string): SessionState | undefined {
    return getSession(name);
  }

  /**
   * Find session by working directory
   */
  byDir(dir: string): SessionState | undefined {
    return getSessionByDir(dir);
  }

  /**
   * Find session by URL path (for proxy routing)
   */
  byPath(urlPath: string): SessionState | null {
    const sessions = getAllSessions();
    const basePath = normalizeBasePath(this.config.base_path);

    for (const session of sessions) {
      const sessionFullPath = `${basePath}${session.path}`;
      if (urlPath.startsWith(`${sessionFullPath}/`) || urlPath === sessionFullPath) {
        return session;
      }
    }

    return null;
  }

  /**
   * Find session definition from config by name
   */
  definitionByName(name: string): SessionDefinition | undefined {
    return this.config.sessions.find((s) => s.name === name);
  }

  /**
   * Get all active sessions
   */
  all(): SessionState[] {
    return getAllSessions();
  }

  /**
   * Check if a session exists by name
   */
  exists(name: string): boolean {
    return this.byName(name) !== undefined;
  }

  /**
   * Check if a session exists for a directory
   */
  existsForDir(dir: string): boolean {
    return this.byDir(dir) !== undefined;
  }
}

/**
 * Create a SessionResolver for the given config
 */
export function createSessionResolver(config: Config): SessionResolver {
  return new SessionResolver(config);
}
