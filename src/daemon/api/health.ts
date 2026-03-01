/**
 * Health check API endpoint
 *
 * Provides daemon health status for monitoring and load balancing.
 */

import { VERSION } from '@/version.js';
import { sendJson } from '../http-utils.js';
import { sessionManager } from '../session-manager.js';
import type { RouteContext, RouteHandler } from './types.js';

// Track daemon start time
const daemonStartTime = Date.now();

/**
 * Health check response
 */
interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  version: string;
  uptime: number;
  uptimeHuman: string;
  sessions: {
    count: number;
    names: string[];
  };
  memory: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
  };
  timestamp: string;
}

/**
 * Format uptime in human-readable format
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(' ');
}

/**
 * Handle health check routes
 *
 * Routes:
 * - GET /api/health - Full health check with details
 * - GET /api/health/live - Simple liveness probe (for k8s)
 * - GET /api/health/ready - Readiness probe (for k8s)
 */
export const handleHealthRoutes: RouteHandler = (ctx: RouteContext): boolean => {
  const { res, path, method } = ctx;

  if (method !== 'GET') {
    return false;
  }

  // GET /api/health - Full health check
  if (path === '/api/health') {
    const sessions = sessionManager.listSessions();
    const uptimeSeconds = (Date.now() - daemonStartTime) / 1000;
    const memoryUsage = process.memoryUsage();

    const response: HealthResponse = {
      status: 'ok',
      version: VERSION,
      uptime: Math.floor(uptimeSeconds),
      uptimeHuman: formatUptime(uptimeSeconds),
      sessions: {
        count: sessions.length,
        names: sessions.map((s: { name: string }) => s.name)
      },
      memory: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        rss: memoryUsage.rss
      },
      timestamp: new Date().toISOString()
    };

    sendJson(res, 200, response);
    return true;
  }

  // GET /api/health/live - Liveness probe
  if (path === '/api/health/live') {
    sendJson(res, 200, { status: 'ok' });
    return true;
  }

  // GET /api/health/ready - Readiness probe
  if (path === '/api/health/ready') {
    // Check if daemon is ready to serve requests
    // For now, always ready if we can respond
    sendJson(res, 200, { status: 'ok' });
    return true;
  }

  return false;
};
