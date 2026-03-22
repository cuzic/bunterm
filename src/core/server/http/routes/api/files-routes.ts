/**
 * Files API Routes
 *
 * Handles file operations: list, download, upload, clipboard images.
 */

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { ok, err } from '@/utils/result.js';
import { sessionNotFound, notFound, validationFailed, pathTraversal } from '@/core/errors.js';
import { validateSecurePath } from '@/utils/path-security.js';
import { createLogger } from '@/utils/logger.js';
import type { RouteDef, RouteContext } from '../../route-types.js';
import { securityHeaders } from '../../utils.js';

const log = createLogger('files-api');

// === Schemas ===

const FileListQuerySchema = z.object({
  session: z.string().min(1, 'session is required'),
  path: z.string().optional().default('.')
});

const FileUploadQuerySchema = z.object({
  session: z.string().min(1, 'session is required'),
  path: z.string().min(1, 'path is required')
});

const ClipboardImageQuerySchema = z.object({
  session: z.string().min(1, 'session is required')
});

const ClipboardImageBodySchema = z.object({
  images: z.array(
    z.object({
      data: z.string().min(1),
      mimeType: z.string().regex(/^image\//, 'mimeType must be image/*'),
      name: z.string().optional()
    })
  ).min(1, 'images array is required')
});

// === Response Types ===

interface FileEntry {
  name: string;
  isDirectory: boolean;
  size: number;
}

interface FileListResponse {
  path: string;
  files: FileEntry[];
}

// === Helper Functions ===

function getSessionCwd(ctx: RouteContext, sessionName: string): string | null {
  const session = ctx.sessionManager.getSession(sessionName);
  return session?.cwd ?? null;
}

// === Routes ===

export const filesRoutes: RouteDef[] = [
  {
    method: 'GET',
    path: '/api/files/list',
    querySchema: FileListQuerySchema,
    description: 'List files in a directory',
    tags: ['files'],
    handler: async (ctx) => {
      const { session: sessionName, path: filePath } = ctx.params as z.infer<typeof FileListQuerySchema>;

      const cwd = getSessionCwd(ctx, sessionName);
      if (!cwd) {
        return err(sessionNotFound(sessionName));
      }

      const pathResult = validateSecurePath(cwd, filePath);
      if (!pathResult.valid) {
        return err(pathTraversal(filePath));
      }
      const targetPath = pathResult.targetPath!;

      if (!existsSync(targetPath)) {
        return err(notFound('Path not found'));
      }

      const stat = statSync(targetPath);
      if (!stat.isDirectory()) {
        return err(validationFailed('path', 'Path is not a directory'));
      }

      const entries = readdirSync(targetPath, { withFileTypes: true });
      const files: FileEntry[] = entries.map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        size: entry.isFile() ? statSync(join(targetPath, entry.name)).size : 0
      }));

      return ok<FileListResponse>({ path: filePath, files });
    }
  },

  {
    method: 'POST',
    path: '/api/files/upload',
    querySchema: FileUploadQuerySchema,
    description: 'Upload a file',
    tags: ['files'],
    handler: async (ctx) => {
      const { session: sessionName, path: filePath } = ctx.params as z.infer<typeof FileUploadQuerySchema>;

      const cwd = getSessionCwd(ctx, sessionName);
      if (!cwd) {
        return err(sessionNotFound(sessionName));
      }

      const pathResult = validateSecurePath(cwd, filePath);
      if (!pathResult.valid) {
        return err(pathTraversal(filePath));
      }
      const targetPath = pathResult.targetPath!;

      const content = await ctx.req.arrayBuffer();
      writeFileSync(targetPath, Buffer.from(content));

      return ok({ success: true, path: filePath });
    }
  },

  {
    method: 'POST',
    path: '/api/clipboard-image',
    querySchema: ClipboardImageQuerySchema,
    bodySchema: ClipboardImageBodySchema,
    description: 'Save clipboard images to temp directory',
    tags: ['files'],
    handler: async (ctx) => {
      const { session: sessionName } = ctx.params as z.infer<typeof ClipboardImageQuerySchema>;
      const { images } = ctx.body as z.infer<typeof ClipboardImageBodySchema>;

      const cwd = getSessionCwd(ctx, sessionName);
      if (!cwd) {
        return err(sessionNotFound(sessionName));
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

      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        if (!img) continue;

        const ext = img.mimeType.split('/')[1] || 'png';
        const uniqueSuffix = randomBytes(4).toString('hex');
        let filename: string;
        if (images.length === 1) {
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

      return ok({ success: true, paths: savedPaths });
    }
  }
];

// === File Download Handler (returns binary, not JSON) ===

/**
 * Handle file download - returns binary response directly
 * This doesn't fit the standard Result pattern, so it's handled separately.
 */
export async function handleFileDownload(ctx: RouteContext): Promise<Response | null> {
  const url = new URL(ctx.req.url);
  const sessionName = url.searchParams.get('session');
  const filePath = url.searchParams.get('path');

  if (!sessionName || !filePath) {
    return null;
  }

  const cwd = getSessionCwd(ctx, sessionName);
  if (!cwd) {
    return null;
  }

  const pathResult = validateSecurePath(cwd, filePath);
  if (!pathResult.valid) {
    return null;
  }
  const targetPath = pathResult.targetPath!;

  if (!existsSync(targetPath)) {
    return null;
  }

  const content = readFileSync(targetPath);
  const filename = filePath.split('/').pop() || 'download';

  return new Response(content, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
      ...securityHeaders(ctx.sentryEnabled)
    }
  });
}

// === Legacy Handler (deprecated) ===

/**
 * @deprecated Use filesRoutes with RouteRegistry instead
 */
export async function handleFilesRoutes(): Promise<Response | null> {
  return null;
}
