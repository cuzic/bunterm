/**
 * HTTP utility functions for daemon API handlers
 *
 * Provides centralized request parsing and response formatting.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { generateJsonResponse } from './portal.js';

// =============================================================================
// Constants
// =============================================================================

/** Maximum request body size for JSON payloads (1MB) */
export const MAX_JSON_BODY_SIZE = 1 * 1024 * 1024;

/** Maximum WebSocket message size (10MB) */
export const MAX_WEBSOCKET_MESSAGE_SIZE = 10 * 1024 * 1024;

// =============================================================================
// Request Body Reading
// =============================================================================

/**
 * Read request body with size limit to prevent DoS attacks
 * @param req - Incoming HTTP request
 * @param maxSize - Maximum allowed body size in bytes
 * @returns Promise that resolves to body string or rejects with error
 */
export function readBodyWithLimit(req: IncomingMessage, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxSize) {
        req.destroy();
        reject(new Error(`Request body too large (max: ${maxSize} bytes)`));
        return;
      }
      body += chunk.toString();
    });

    req.on('end', () => {
      resolve(body);
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Read request body as Buffer with size limit
 * @param req - Incoming HTTP request
 * @param maxSize - Maximum allowed body size in bytes
 * @returns Promise that resolves to body Buffer or rejects with error
 */
export function readBufferWithLimit(req: IncomingMessage, maxSize: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxSize) {
        req.destroy();
        reject(new Error(`Request body too large (max: ${maxSize} bytes)`));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

// =============================================================================
// Query Parameter Parsing
// =============================================================================

/**
 * Parse query parameters from URL path
 * @param path - URL path (may include query string)
 * @returns URLSearchParams instance
 */
export function parseQueryParams(path: string): URLSearchParams {
  const queryStart = path.indexOf('?');
  return new URLSearchParams(queryStart >= 0 ? path.slice(queryStart + 1) : '');
}

// =============================================================================
// Response Helpers
// =============================================================================

/**
 * Send JSON response
 * @param res - Server response
 * @param status - HTTP status code
 * @param data - Data to serialize as JSON
 */
export function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = generateJsonResponse(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

/**
 * Send JSON error response
 * @param res - Server response
 * @param status - HTTP status code
 * @param error - Error message
 */
export function sendJsonError(res: ServerResponse, status: number, error: string): void {
  sendJson(res, status, { error });
}

/**
 * Send JSON success response
 * @param res - Server response
 * @param status - HTTP status code
 * @param data - Additional data to include
 */
export function sendJsonSuccess(
  res: ServerResponse,
  status: number,
  data?: Record<string, unknown>
): void {
  sendJson(res, status, { success: true, ...data });
}
