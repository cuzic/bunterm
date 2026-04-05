/**
 * URL Builder
 *
 * Build URLs for sessions and shares.
 */

import { getFullPath } from '@/core/config/config.js';
import type { Config } from '@/core/config/types.js';

/**
 * Build the base URL for accessing bunterm
 */
function buildBaseUrl(config: Config): string {
  const hostname = config.hostname ?? `localhost:${config.daemon_port}`;
  const protocol = config.hostname ? 'https' : 'http';
  return `${protocol}://${hostname}`;
}

/**
 * Build the URL for a session
 */
export function buildSessionUrl(config: Config, sessionPath: string): string {
  const baseUrl = buildBaseUrl(config);
  const fullPath = getFullPath(config, sessionPath);
  return `${baseUrl}${fullPath}/`;
}

/**
 * Build the URL for a share
 */
export function buildShareUrl(config: Config, token: string): string {
  const baseUrl = buildBaseUrl(config);
  return `${baseUrl}${config.base_path}/share/${token}`;
}
