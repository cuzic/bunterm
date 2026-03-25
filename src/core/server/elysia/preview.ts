/**
 * Preview API Routes (Elysia)
 *
 * Handles context file listing and content retrieval for AI.
 * Replaces the old preview-routes.ts with Elysia's TypeBox validation.
 *
 * NOTE: File preview (HTML response) is handled separately in Phase 2-3.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, extname, join, relative } from 'node:path';
import { Elysia, t } from 'elysia';
import { createLogger } from '@/utils/logger.js';
import { validateSecurePath } from '@/utils/path-security.js';
import { coreContext } from './context.js';
import { ErrorResponseSchema } from './errors.js';
import { validateFilePath } from './route-helpers.js';

const log = createLogger('preview-api');

// === Helper Functions ===

interface FileInfo {
  path: string;
  name: string;
  size: number;
  modifiedAt: string;
}

interface CollectOptions {
  excludeDirs?: string[];
  maxDepth?: number;
}

function collectMdFiles(
  dir: string,
  baseDir: string,
  options: CollectOptions = {},
  currentDepth = 0
): FileInfo[] {
  const { excludeDirs = [], maxDepth = 5 } = options;
  const files: FileInfo[] = [];

  if (currentDepth > maxDepth) {
    return files;
  }

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (excludeDirs.includes(entry.name) || entry.name.startsWith('.')) {
          continue;
        }
        const subFiles = collectMdFiles(entryPath, baseDir, options, currentDepth + 1);
        files.push(...subFiles);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const stat = statSync(entryPath);
          files.push({
            path: relative(baseDir, entryPath),
            name: entry.name,
            size: stat.size,
            modifiedAt: stat.mtime.toISOString()
          });
        } catch {
          // Skip files that can't be stat'd
        }
      }
    }
  } catch {
    // Skip directories that can't be read
  }

  return files;
}

// === Response Schemas ===

const CollectedFileSchema = t.Object({
  source: t.Union([t.Literal('plans'), t.Literal('project')]),
  path: t.String(),
  name: t.String(),
  size: t.Number(),
  modifiedAt: t.String()
});

const RecentFilesResponseSchema = t.Object({
  files: t.Array(CollectedFileSchema)
});

const FileContentResponseSchema = t.Object({
  source: t.Union([t.Literal('plans'), t.Literal('project')]),
  path: t.String(),
  name: t.String(),
  content: t.String(),
  size: t.Number(),
  modifiedAt: t.String()
});

// === Plugin ===

export const previewPlugin = new Elysia({ prefix: '/api' })
  .use(coreContext)

  // GET /api/context-files/recent?session=xxx&count=10
  .get(
    '/context-files/recent',
    ({ sessionManager, query, error }) => {
      const sessionName = query.session;
      const count = query.count ?? 10;

      const session = sessionManager.getSession(sessionName);
      if (!session) {
        return error(404, {
          error: 'SESSION_NOT_FOUND',
          message: `Session '${sessionName}' not found`
        });
      }

      const files: Array<{
        source: 'plans' | 'project';
        path: string;
        name: string;
        size: number;
        modifiedAt: string;
      }> = [];

      // Get plans files from ~/.claude/plans/
      const plansDir = join(homedir(), '.claude', 'plans');
      if (existsSync(plansDir)) {
        const planFiles = collectMdFiles(plansDir, plansDir);
        for (const file of planFiles) {
          files.push({ source: 'plans', ...file });
        }
      }

      // Get project files from session working directory
      const projectDir = session.cwd;
      if (existsSync(projectDir)) {
        const projectFiles = collectMdFiles(projectDir, projectDir, {
          excludeDirs: ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'vendor']
        });
        for (const file of projectFiles) {
          files.push({ source: 'project', ...file });
        }
      }

      files.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
      const limitedFiles = files.slice(0, count);

      return { files: limitedFiles };
    },
    {
      query: t.Object({
        session: t.String({ minLength: 1 }),
        count: t.Optional(t.Number({ minimum: 1, maximum: 20, default: 10 }))
      }),
      response: {
        200: RecentFilesResponseSchema,
        404: ErrorResponseSchema
      }
    }
  )

  // GET /api/context-files/content?source=plans|project&path=xxx&session=yyy
  .get(
    '/context-files/content',
    async ({ sessionManager, query, error }) => {
      const { source, path: filePath, session: sessionName } = query;

      if (source === 'project' && !sessionName) {
        return error(400, {
          error: 'VALIDATION_FAILED',
          message: 'session parameter is required for project files'
        });
      }

      let targetPath: string;
      if (source === 'plans') {
        const baseDir = join(homedir(), '.claude', 'plans');
        const pathResult = validateSecurePath(baseDir, filePath);
        if (!pathResult.valid) {
          return error(403, { error: 'PATH_TRAVERSAL', message: `Invalid path: ${filePath}` });
        }
        targetPath = pathResult.targetPath;
        if (!existsSync(targetPath)) {
          return error(404, { error: 'NOT_FOUND', message: 'File not found' });
        }
      } else {
        const result = validateFilePath(sessionManager, sessionName!, filePath, {
          checkExistence: true
        });
        if (!result.valid) {
          return error(result.status as 403, { error: result.error, message: result.message });
        }
        targetPath = result.targetPath;
      }

      const stat = statSync(targetPath);
      const MAX_FILE_SIZE = 100 * 1024;
      if (stat.size > MAX_FILE_SIZE) {
        return error(400, {
          error: 'VALIDATION_FAILED',
          message: `File too large (max ${MAX_FILE_SIZE / 1024}KB)`
        });
      }

      const content = await Bun.file(targetPath).text();
      const name = basename(targetPath);

      return {
        source,
        path: filePath,
        name,
        content,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString()
      };
    },
    {
      query: t.Object({
        source: t.Union([t.Literal('plans'), t.Literal('project')]),
        path: t.String({ minLength: 1 }),
        session: t.Optional(t.String())
      }),
      response: {
        200: FileContentResponseSchema,
        400: ErrorResponseSchema,
        403: ErrorResponseSchema,
        404: ErrorResponseSchema
      }
    }
  );

// === Markdown Preview HTML Generator ===

function generateMarkdownPreviewHtml(markdownContent: string, filename: string): string {
  const escapedContent = JSON.stringify(markdownContent);
  const title = basename(filename);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <script src="https://cdn.jsdelivr.net/npm/markdown-it@14/dist/markdown-it.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/markdown-it-cjk-friendly@1/dist/markdown-it-cjk-friendly.min.js"></script>
  <style>
    :root { color-scheme: light dark; }
    body { max-width: 800px; margin: 0 auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; background: #fff; color: #333; }
    @media (prefers-color-scheme: dark) { body { background: #1e1e1e; color: #e0e0e0; } a { color: #6db3f2; } code, pre { background: #2d2d2d; } blockquote { border-color: #444; color: #aaa; } table th, table td { border-color: #444; } hr { border-color: #444; } }
    h1, h2, h3, h4, h5, h6 { margin-top: 1.5em; margin-bottom: 0.5em; line-height: 1.3; }
    h1 { font-size: 2em; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
    a { color: #0366d6; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { background: #f6f8fa; padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; font-family: "SF Mono", Consolas, "Liberation Mono", Menlo, monospace; }
    pre { background: #f6f8fa; padding: 16px; overflow-x: auto; border-radius: 6px; }
    pre code { background: none; padding: 0; }
    blockquote { margin: 0; padding-left: 1em; border-left: 4px solid #ddd; color: #666; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    table th, table td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    table th { background: #f6f8fa; font-weight: 600; }
    img { max-width: 100%; height: auto; }
    hr { border: none; border-top: 1px solid #eee; margin: 2em 0; }
    ul, ol { padding-left: 2em; }
    li { margin: 0.25em 0; }
  </style>
</head>
<body>
  <div id="content"></div>
  <script>
    const md = window.markdownit({ html: false, linkify: true, typographer: true }).use(window.markdownItCjkFriendly);
    const content = ${escapedContent};
    document.getElementById('content').innerHTML = md.render(content);
  </script>
</body>
</html>`;
}

// === File Preview Plugin (HTML response) ===

export const previewFilePlugin = new Elysia({ prefix: '/api' })
  .use(coreContext)

  // GET /api/preview?session=xxx&path=yyy - File preview (returns HTML)
  .get(
    '/preview',
    async ({ sessionManager, query, set }) => {
      const sessionName = query.session;
      const filePath = query.path;

      const result = validateFilePath(sessionManager, sessionName, filePath, {
        checkExistence: true
      });
      if (!result.valid) {
        set.status = result.status;
        return new Response(result.message, {
          status: result.status,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
      const { targetPath } = result;

      const content = await Bun.file(targetPath).text();
      log.info(`Serving preview: ${targetPath} (${content.length} bytes)`);

      const ext = extname(filePath).toLowerCase();
      const isMarkdown = ext === '.md' || ext === '.markdown';

      if (isMarkdown) {
        const html = generateMarkdownPreviewHtml(content, filePath);
        return new Response(html, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }

      return new Response(content, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    },
    {
      query: t.Object({
        session: t.String({ minLength: 1 }),
        path: t.String({ minLength: 1 })
      })
    }
  )
  .as('global');
