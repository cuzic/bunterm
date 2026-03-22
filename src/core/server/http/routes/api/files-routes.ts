/**
 * Files API Routes
 *
 * Handles file operations: list, download, upload, clipboard images.
 */

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ApiContext } from './types.js';
import { jsonResponse, errorResponse } from '../../utils.js';
import { validateSecurePath } from '@/utils/path-security.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('files-api');

/**
 * Handle files API routes
 */
export async function handleFilesRoutes(ctx: ApiContext): Promise<Response | null> {
  const { apiPath, method, req, sessionManager, sentryEnabled } = ctx;

  // GET /api/files/list?session=<name>&path=<path>
  if (apiPath.startsWith('/files/list') && method === 'GET') {
    const params = new URL(req.url).searchParams;
    const sessionName = params.get('session');
    const filePath = params.get('path') || '.';

    if (!sessionName) {
      return errorResponse('session parameter is required', 400, sentryEnabled);
    }

    const session = sessionManager.getSession(sessionName);
    if (!session) {
      return errorResponse(`Session "${sessionName}" not found`, 404, sentryEnabled);
    }

    try {
      const baseDir = session.cwd;
      const pathResult = validateSecurePath(baseDir, filePath);
      if (!pathResult.valid) {
        return errorResponse(pathResult.error!, 400, sentryEnabled);
      }
      const targetPath = pathResult.targetPath!;

      if (!existsSync(targetPath)) {
        return errorResponse('Path not found', 404, sentryEnabled);
      }

      const stat = statSync(targetPath);
      if (!stat.isDirectory()) {
        return errorResponse('Path is not a directory', 400, sentryEnabled);
      }

      const entries = readdirSync(targetPath, { withFileTypes: true });
      const files = entries.map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        size: entry.isFile() ? statSync(join(targetPath, entry.name)).size : 0
      }));

      return jsonResponse({ path: filePath, files }, { sentryEnabled });
    } catch (error) {
      return errorResponse(String(error), 500, sentryEnabled);
    }
  }

  // GET /api/files/download?session=<name>&path=<path>
  if (apiPath.startsWith('/files/download') && method === 'GET') {
    const params = new URL(req.url).searchParams;
    const sessionName = params.get('session');
    const filePath = params.get('path');

    if (!sessionName || !filePath) {
      return errorResponse('session and path parameters are required', 400, sentryEnabled);
    }

    const session = sessionManager.getSession(sessionName);
    if (!session) {
      return errorResponse(`Session "${sessionName}" not found`, 404, sentryEnabled);
    }

    try {
      const baseDir = session.cwd;
      const pathResult = validateSecurePath(baseDir, filePath);
      if (!pathResult.valid) {
        return errorResponse(pathResult.error!, 400, sentryEnabled);
      }
      const targetPath = pathResult.targetPath!;

      if (!existsSync(targetPath)) {
        return errorResponse('File not found', 404, sentryEnabled);
      }

      const content = readFileSync(targetPath);
      const filename = filePath.split('/').pop() || 'download';

      return new Response(content, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      });
    } catch (error) {
      return errorResponse(String(error), 500, sentryEnabled);
    }
  }

  // POST /api/files/upload?session=<name>&path=<path>
  if (apiPath.startsWith('/files/upload') && method === 'POST') {
    const params = new URL(req.url).searchParams;
    const sessionName = params.get('session');
    const filePath = params.get('path');

    if (!sessionName || !filePath) {
      return errorResponse('session and path parameters are required', 400, sentryEnabled);
    }

    const session = sessionManager.getSession(sessionName);
    if (!session) {
      return errorResponse(`Session "${sessionName}" not found`, 404, sentryEnabled);
    }

    try {
      const baseDir = session.cwd;
      const pathResult = validateSecurePath(baseDir, filePath);
      if (!pathResult.valid) {
        return errorResponse(pathResult.error!, 400, sentryEnabled);
      }
      const targetPath = pathResult.targetPath!;

      const content = await req.arrayBuffer();
      writeFileSync(targetPath, Buffer.from(content));

      return jsonResponse({ success: true, path: filePath }, { status: 201, sentryEnabled });
    } catch (error) {
      return errorResponse(String(error), 500, sentryEnabled);
    }
  }

  // POST /api/clipboard-image?session=<name>
  if (apiPath.startsWith('/clipboard-image') && method === 'POST') {
    const params = new URL(req.url).searchParams;
    const sessionName = params.get('session');

    if (!sessionName) {
      return errorResponse('session parameter is required', 400, sentryEnabled);
    }

    const session = sessionManager.getSession(sessionName);
    if (!session) {
      return errorResponse(`Session "${sessionName}" not found`, 404, sentryEnabled);
    }

    try {
      const body = (await req.json()) as {
        images: Array<{ data: string; mimeType: string; name?: string }>;
      };

      if (!body.images || !Array.isArray(body.images) || body.images.length === 0) {
        return errorResponse('images array is required', 400, sentryEnabled);
      }

      const tempBaseDir = join(tmpdir(), 'bunterm-clipboard');
      if (!existsSync(tempBaseDir)) {
        mkdirSync(tempBaseDir, { recursive: true });
      }

      const savedPaths: string[] = [];
      const now = new Date();
      const timestamp = now
        .toISOString()
        .replace(/[-:]/g, '')
        .replace('T', '-')
        .replace(/\.\d{3}Z/, '');

      for (let i = 0; i < body.images.length; i++) {
        const img = body.images[i];
        if (!img) continue;

        if (!img.mimeType?.startsWith('image/')) {
          return errorResponse('Invalid MIME type: must be image/*', 400, sentryEnabled);
        }

        const ext = img.mimeType.split('/')[1] || 'png';
        const uniqueSuffix = randomBytes(4).toString('hex');
        let filename: string;
        if (body.images.length === 1) {
          filename = `clipboard-${timestamp}-${uniqueSuffix}.${ext}`;
        } else {
          const suffix = String(i + 1).padStart(3, '0');
          filename = `clipboard-${timestamp}-${suffix}-${uniqueSuffix}.${ext}`;
        }

        const base64Data = img.data.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const targetPath = join(tempBaseDir, filename);
        writeFileSync(targetPath, buffer);

        savedPaths.push(targetPath);
        log.info(`Saved clipboard image: ${targetPath}`);
      }

      return jsonResponse({ success: true, paths: savedPaths }, { status: 201, sentryEnabled });
    } catch (error) {
      log.error(`Clipboard image error: ${error}`);
      return errorResponse(String(error), 500, sentryEnabled);
    }
  }

  return null;
}
