/**
 * Files API Routes (Elysia)
 *
 * Handles file operations: list, upload, clipboard images.
 * Replaces the old files-routes.ts with Elysia's TypeBox validation.
 *
 * NOTE: File download (binary response) is handled separately in Phase 2-3.
 */

import { randomBytes } from 'node:crypto';
// biome-ignore lint: existsSync used for quick path validation in handlers
import { existsSync } from 'node:fs';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Elysia, t } from 'elysia';
import { createLogger } from '@/utils/logger.js';
import { validateSecurePath } from '@/utils/path-security.js';
import { coreContext } from './context.js';
import { ErrorResponseSchema } from './errors.js';

const log = createLogger('files-api');

// === Response Schemas ===

const FileEntrySchema = t.Object({
  name: t.String(),
  isDirectory: t.Boolean(),
  size: t.Number()
});

const FileListResponseSchema = t.Object({
  path: t.String(),
  files: t.Array(FileEntrySchema)
});

const UploadResponseSchema = t.Object({
  success: t.Boolean(),
  path: t.String()
});

const ClipboardResponseSchema = t.Object({
  success: t.Boolean(),
  paths: t.Array(t.String())
});

// === Plugin ===

export const filesPlugin = new Elysia({ prefix: '/api' })
  .use(coreContext)

  // GET /api/files/list?session=xxx&path=yyy
  .get(
    '/files/list',
    async ({ sessionManager, query, error }) => {
      const sessionName = query.session;
      const filePath = query.path ?? '.';

      const session = sessionManager.getSession(sessionName);
      if (!session) {
        return error(404, {
          error: 'SESSION_NOT_FOUND',
          message: `Session '${sessionName}' not found`
        });
      }

      const cwd = session.cwd;
      const pathResult = validateSecurePath(cwd, filePath);
      if (!pathResult.valid) {
        return error(403, { error: 'PATH_TRAVERSAL', message: `Invalid path: ${filePath}` });
      }
      const targetPath = pathResult.targetPath!;

      if (!existsSync(targetPath)) {
        return error(404, { error: 'NOT_FOUND', message: 'Path not found' });
      }

      const targetStat = await stat(targetPath);
      if (!targetStat.isDirectory()) {
        return error(400, { error: 'VALIDATION_FAILED', message: 'Path is not a directory' });
      }

      const entries = await readdir(targetPath, { withFileTypes: true });
      const files = await Promise.all(
        entries.map(async (entry) => ({
          name: entry.name,
          isDirectory: entry.isDirectory(),
          size: entry.isFile() ? (await stat(join(targetPath, entry.name))).size : 0
        }))
      );

      return { path: filePath, files };
    },
    {
      query: t.Object({
        session: t.String({ minLength: 1 }),
        path: t.Optional(t.String())
      }),
      response: {
        200: FileListResponseSchema,
        400: ErrorResponseSchema,
        403: ErrorResponseSchema,
        404: ErrorResponseSchema
      }
    }
  )

  // POST /api/files/upload?session=xxx&path=yyy
  .post(
    '/files/upload',
    async ({ sessionManager, query, request, error }) => {
      const sessionName = query.session;
      const filePath = query.path;

      const MAX_UPLOAD_SIZE = 100 * 1024 * 1024; // 100MB
      const contentLength = Number(request.headers.get('content-length') || '0');
      if (contentLength > MAX_UPLOAD_SIZE) {
        return error(413, { error: 'PAYLOAD_TOO_LARGE', message: 'File exceeds 100MB limit' });
      }

      const session = sessionManager.getSession(sessionName);
      if (!session) {
        return error(404, {
          error: 'SESSION_NOT_FOUND',
          message: `Session '${sessionName}' not found`
        });
      }

      const cwd = session.cwd;
      const pathResult = validateSecurePath(cwd, filePath);
      if (!pathResult.valid) {
        return error(403, { error: 'PATH_TRAVERSAL', message: `Invalid path: ${filePath}` });
      }
      const targetPath = pathResult.targetPath!;

      const content = await request.arrayBuffer();
      await writeFile(targetPath, Buffer.from(content));

      return { success: true, path: filePath };
    },
    {
      query: t.Object({
        session: t.String({ minLength: 1 }),
        path: t.String({ minLength: 1 })
      }),
      response: {
        200: UploadResponseSchema,
        403: ErrorResponseSchema,
        404: ErrorResponseSchema,
        413: ErrorResponseSchema
      }
    }
  )

  // POST /api/clipboard-image?session=xxx
  .post(
    '/clipboard-image',
    async ({ sessionManager, query, body, error }) => {
      const sessionName = query.session;

      const session = sessionManager.getSession(sessionName);
      if (!session) {
        return error(404, {
          error: 'SESSION_NOT_FOUND',
          message: `Session '${sessionName}' not found`
        });
      }

      const tempBaseDir = join(tmpdir(), 'bunterm-clipboard');
      if (!existsSync(tempBaseDir)) {
        await mkdir(tempBaseDir, { recursive: true });
      }

      const ALLOWED_IMAGE_TYPES = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']);
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

        const subtype = img.mimeType.split('/')[1] || 'png';
        const ext = ALLOWED_IMAGE_TYPES.has(subtype) ? subtype : 'png';
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
        await writeFile(targetPath, buffer);

        savedPaths.push(targetPath);
        log.info(`Saved clipboard image: ${targetPath}`);
      }

      return { success: true, paths: savedPaths };
    },
    {
      query: t.Object({
        session: t.String({ minLength: 1 })
      }),
      body: t.Object({
        images: t.Array(
          t.Object({
            data: t.String({ minLength: 1 }),
            mimeType: t.String({ pattern: '^image/' }),
            name: t.Optional(t.String())
          }),
          { minItems: 1 }
        )
      }),
      response: {
        200: ClipboardResponseSchema,
        404: ErrorResponseSchema
      }
    }
  )

  // GET /api/files/download?session=xxx&path=yyy - Binary file download
  .get(
    '/files/download',
    async ({ sessionManager, query, set }) => {
      const sessionName = query.session;
      const filePath = query.path;

      const session = sessionManager.getSession(sessionName);
      if (!session) {
        set.status = 404;
        return new Response(
          JSON.stringify({
            error: 'SESSION_NOT_FOUND',
            message: `Session '${sessionName}' not found`
          }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const cwd = session.cwd;
      const pathResult = validateSecurePath(cwd, filePath);
      if (!pathResult.valid) {
        set.status = 403;
        return new Response(
          JSON.stringify({ error: 'PATH_TRAVERSAL', message: `Invalid path: ${filePath}` }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }
      const targetPath = pathResult.targetPath!;

      if (!existsSync(targetPath)) {
        set.status = 404;
        return new Response(JSON.stringify({ error: 'NOT_FOUND', message: 'File not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const content = await Bun.file(targetPath).arrayBuffer();
      const filename = filePath.split('/').pop() || 'download';

      return new Response(content, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
        }
      });
    },
    {
      query: t.Object({
        session: t.String({ minLength: 1 }),
        path: t.String({ minLength: 1 })
      })
    }
  );
