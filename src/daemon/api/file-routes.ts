/**
 * File transfer and preview API routes
 *
 * Handles: /api/files/*, /api/preview/*
 */

import { extname } from 'node:path';
import { getErrorMessage } from '@/utils/errors.js';
import {
  extractBoundary,
  handleFileDownload,
  handleFileList,
  handleFileUpload,
  handleRecentFiles,
  parseMultipartFile
} from '../file-transfer-api.js';
import { createFileTransferManager } from '../file-transfer.js';
import { parseQueryParams, readBufferWithLimit, sendJson } from '../http-utils.js';
import { sessionManager } from '../session-manager.js';
import type { RouteContext, RouteHandler } from './types.js';

/**
 * File routes handler
 */
export const handleFileRoutes: RouteHandler = (ctx: RouteContext): boolean => {
  const { config, req, res, path, method } = ctx;

  // GET /api/files/download?session=<name>&path=<path> - Download file
  if (path.startsWith('/api/files/download') && method === 'GET') {
    const params = parseQueryParams(path);
    const sessionName = params.get('session');
    const filePath = params.get('path');

    if (!sessionName || !filePath) {
      sendJson(res, 400, { error: 'session and path parameters are required' });
      return true;
    }

    // Find session
    const session = sessionManager.findByName(sessionName);
    if (!session) {
      sendJson(res, 404, { error: `Session "${sessionName}" not found` });
      return true;
    }

    const manager = createFileTransferManager({
      baseDir: session.dir,
      config: config.file_transfer
    });
    handleFileDownload(manager, filePath, res).catch(() => {
      sendJson(res, 500, { error: 'Internal server error' });
    });
    return true;
  }

  // POST /api/files/upload?session=<name>&path=<path> - Upload file
  if (path.startsWith('/api/files/upload') && method === 'POST') {
    const params = parseQueryParams(path);
    const sessionName = params.get('session');
    const uploadPath = params.get('path') || '';

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

    // Read request body with size limit
    const maxSize = config.file_transfer.max_file_size;
    readBufferWithLimit(req, maxSize)
      .then(async (body) => {
        const contentType = req.headers['content-type'] || '';

        let filename: string;
        let content: Buffer;

        // Handle multipart form data
        if (contentType.includes('multipart/form-data')) {
          const boundary = extractBoundary(contentType);
          if (!boundary) {
            sendJson(res, 400, { error: 'Invalid multipart boundary' });
            return;
          }

          const parsed = parseMultipartFile(body, boundary);
          if (!parsed) {
            sendJson(res, 400, { error: 'Failed to parse multipart data' });
            return;
          }

          filename = uploadPath ? `${uploadPath}/${parsed.filename}` : parsed.filename;
          content = parsed.content;
        } else {
          // Direct upload with path in query
          if (!uploadPath) {
            sendJson(res, 400, { error: 'path parameter is required for direct upload' });
            return;
          }
          filename = uploadPath;
          content = body;
        }

        const manager = createFileTransferManager({
          baseDir: session.dir,
          config: config.file_transfer
        });
        await handleFileUpload(manager, filename, content, res);
      })
      .catch((error) => {
        sendJson(res, 413, { error: getErrorMessage(error) });
      });
    return true;
  }

  // GET /api/files/list?session=<name>&path=<path>&preview=true - List files
  if (path.startsWith('/api/files/list') && method === 'GET') {
    const params = parseQueryParams(path);
    const sessionName = params.get('session');
    const listPath = params.get('path') || '.';
    const previewMode = params.get('preview') === 'true';

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

    const manager = createFileTransferManager({
      baseDir: session.dir,
      config: config.file_transfer
    });
    const listOptions = previewMode ? { checkIndexHtml: true } : undefined;
    handleFileList(manager, listPath, res, listOptions).catch(() => {
      sendJson(res, 500, { error: 'Internal server error' });
    });
    return true;
  }

  // GET /api/files/recent?session=<name>&extensions=.html,.md&count=5&source=scan|claude-history
  if (path.startsWith('/api/files/recent') && method === 'GET') {
    const params = parseQueryParams(path);
    const sessionName = params.get('session');
    const extensionsParam = params.get('extensions') || '.html,.htm,.md,.txt';
    const countParam = params.get('count') || '5';
    const sourceParam = params.get('source') || 'claude-history';

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

    // Parse extensions
    const extensions = extensionsParam.split(',').map((ext) => ext.trim());
    const count = Math.min(Math.max(1, Number.parseInt(countParam, 10) || 5), 20);
    const source = sourceParam === 'scan' ? 'scan' : 'claude-history';

    const manager = createFileTransferManager({
      baseDir: session.dir,
      config: config.file_transfer
    });
    handleRecentFiles(manager, res, { extensions, maxCount: count, maxDepth: 5, source }).catch(
      () => {
        sendJson(res, 500, { error: 'Internal server error' });
      }
    );
    return true;
  }

  // GET /api/preview/file?session=<name>&path=<path> - Serve preview file
  if (path.startsWith('/api/preview/file') && method === 'GET') {
    const params = parseQueryParams(path);
    const sessionName = params.get('session');
    const filePath = params.get('path');

    if (!sessionName || !filePath) {
      sendJson(res, 400, { error: 'session and path parameters are required' });
      return true;
    }

    // Check if preview is enabled
    if (!config.preview.enabled) {
      sendJson(res, 403, { error: 'Preview is disabled' });
      return true;
    }

    // Check extension using path.extname for security
    // This prevents bypasses like "file.html.php" matching ".html"
    const fileExt = extname(filePath).toLowerCase();
    const isAllowed = config.preview.allowed_extensions.some(
      (ext) => ext.toLowerCase() === fileExt
    );
    if (!isAllowed) {
      sendJson(res, 403, { error: 'File extension not allowed for preview' });
      return true;
    }

    // Find session
    const session = sessionManager.findByName(sessionName);
    if (!session) {
      sendJson(res, 404, { error: `Session "${sessionName}" not found` });
      return true;
    }

    const manager = createFileTransferManager({
      baseDir: session.dir,
      config: config.file_transfer
    });

    // Determine content type based on extension
    const getContentType = (ext: string): string => {
      switch (ext) {
        case '.html':
        case '.htm':
          return 'text/html; charset=utf-8';
        case '.md':
        case '.txt':
          return 'text/plain; charset=utf-8';
        default:
          return 'text/plain; charset=utf-8';
      }
    };

    // Use download handler and set appropriate content type
    (async () => {
      const result = await manager.downloadFile(filePath);
      if (!result.success || !result.data) {
        sendJson(res, 404, { error: result.error || 'File not found' });
        return;
      }

      const contentType = getContentType(fileExt);

      // Serve with appropriate content type and cache control
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': result.data.length,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Frame-Options': 'SAMEORIGIN'
      });
      res.end(result.data);
    })().catch(() => {
      sendJson(res, 500, { error: 'Internal server error' });
    });
    return true;
  }

  return false;
};
