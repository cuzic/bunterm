/**
 * Clipboard image API routes
 *
 * Handles: /api/clipboard-image
 */

import { getErrorMessage } from '@/utils/errors.js';
import { createLogger } from '@/utils/logger.js';
import type { ClipboardImageInput } from '../file-transfer.js';
import { saveClipboardImages } from '../file-transfer.js';
import { parseQueryParams, readBodyWithLimit, sendJson } from '../http-utils.js';
import { sessionManager } from '../session-manager.js';
import type { RouteContext, RouteHandler } from './types.js';

const log = createLogger('api-clipboard');

/**
 * Clipboard routes handler
 */
export const handleClipboardRoutes: RouteHandler = (ctx: RouteContext): boolean => {
  const { config, req, res, path, method } = ctx;

  // POST /api/clipboard-image?session=<name> - Upload clipboard images
  if (path.startsWith('/api/clipboard-image') && method === 'POST') {
    const params = parseQueryParams(path);
    const sessionName = params.get('session');

    if (!sessionName) {
      sendJson(res, 400, { error: 'session parameter is required' });
      return true;
    }

    // Find session
    const session = sessionManager.findByName(sessionName);
    if (!session) {
      sendJson(res, 404, { error: `Session "${sessionName}" not found` });
      return true;
    }

    // Read request body with size limit (clipboard images are base64 encoded, so limit is larger)
    const maxSize = config.file_transfer.max_file_size;
    readBodyWithLimit(req, maxSize)
      .then(async (body) => {
        const parsed = JSON.parse(body) as {
          images: ClipboardImageInput[];
        };

        if (!parsed.images || !Array.isArray(parsed.images) || parsed.images.length === 0) {
          sendJson(res, 400, { error: 'images array is required' });
          return;
        }

        // Validate each image
        for (const img of parsed.images) {
          if (!img.data || !img.mimeType) {
            sendJson(res, 400, { error: 'Each image must have data and mimeType' });
            return;
          }
          if (!img.mimeType.startsWith('image/')) {
            sendJson(res, 400, { error: 'Invalid mimeType: must be an image type' });
            return;
          }
        }

        // Save images to session directory
        const result = await saveClipboardImages(session.dir, parsed.images, config.file_transfer);

        if (!result.success) {
          sendJson(res, 400, { error: result.error || 'Failed to save images' });
          return;
        }

        log.info(
          `Saved ${result.paths?.length || 0} clipboard image(s) for session: ${sessionName}`
        );
        sendJson(res, 200, { success: true, paths: result.paths });
      })
      .catch((error) => {
        sendJson(res, 413, { error: getErrorMessage(error) });
      });
    return true;
  }

  return false;
};
