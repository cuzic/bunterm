/**
 * Directory browser API routes
 *
 * Handles: /api/directories/*
 */

import { getErrorMessage } from '@/utils/errors.js';
import {
  getAllowedDirectories,
  listSubdirectories,
  validateDirectoryPath
} from '../directory-browser.js';
import {
  MAX_JSON_BODY_SIZE,
  parseQueryParams,
  readBodyWithLimit,
  sendJson
} from '../http-utils.js';
import type { RouteContext, RouteHandler } from './types.js';

/**
 * Directory routes handler
 */
export const handleDirectoryRoutes: RouteHandler = (ctx: RouteContext): boolean => {
  const { config, req, res, path, method } = ctx;

  // GET /api/directories - Get allowed base directories
  if (path === '/api/directories' && method === 'GET') {
    if (!config.directory_browser.enabled) {
      sendJson(res, 403, { error: 'Directory browser is disabled' });
      return true;
    }

    const directories = getAllowedDirectories(config.directory_browser);
    sendJson(res, 200, { directories });
    return true;
  }

  // GET /api/directories/list?base=<index>&path=<subpath> - List subdirectories
  if (path.startsWith('/api/directories/list') && method === 'GET') {
    if (!config.directory_browser.enabled) {
      sendJson(res, 403, { error: 'Directory browser is disabled' });
      return true;
    }

    const params = parseQueryParams(path);
    const baseParam = params.get('base');
    const subPath = params.get('path') || '';

    if (baseParam === null) {
      sendJson(res, 400, { error: 'base parameter is required' });
      return true;
    }

    const baseIndex = Number.parseInt(baseParam, 10);
    if (Number.isNaN(baseIndex) || baseIndex < 0) {
      sendJson(res, 400, { error: 'Invalid base index' });
      return true;
    }

    const result = listSubdirectories(config.directory_browser, baseIndex, subPath);
    if (!result) {
      sendJson(res, 404, { error: 'Directory not found or access denied' });
      return true;
    }

    sendJson(res, 200, result);
    return true;
  }

  // POST /api/directories/validate - Validate a directory path for session creation
  if (path === '/api/directories/validate' && method === 'POST') {
    if (!config.directory_browser.enabled) {
      sendJson(res, 403, { error: 'Directory browser is disabled' });
      return true;
    }

    readBodyWithLimit(req, MAX_JSON_BODY_SIZE)
      .then((body) => {
        const parsed = JSON.parse(body) as { path: string };

        if (!parsed.path) {
          sendJson(res, 400, { error: 'path is required' });
          return;
        }

        const isValid = validateDirectoryPath(config.directory_browser, parsed.path);
        sendJson(res, 200, { valid: isValid });
      })
      .catch((error) => {
        sendJson(res, 400, { error: getErrorMessage(error) });
      });
    return true;
  }

  return false;
};
