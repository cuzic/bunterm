/**
 * Preview API Routes
 *
 * Handles file preview and context files for AI.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, relative } from 'node:path';
import type { ApiContext } from './types.js';
import { jsonResponse, errorResponse } from '../../utils.js';
import { validateSecurePath } from '@/utils/path-security.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('preview-api');

/**
 * Handle preview API routes
 */
export async function handlePreviewRoutes(ctx: ApiContext): Promise<Response | null> {
  const { apiPath, method, req, sessionManager, sentryEnabled } = ctx;

  // GET /api/preview/file?session=<name>&path=<path>
  if (apiPath.startsWith('/preview/file') && method === 'GET') {
    const params = new URL(req.url).searchParams;
    const sessionName = params.get('session');
    const filePath = params.get('path');
    log.info(`Preview request: session=${sessionName}, path=${filePath}`);

    if (!sessionName || !filePath) {
      return errorResponse('session and path parameters are required', 400, sentryEnabled);
    }

    const session = sessionManager.getSession(sessionName);
    if (!session) {
      log.warn(`Session not found: ${sessionName}`);
      return errorResponse(`Session "${sessionName}" not found`, 404, sentryEnabled);
    }

    try {
      const baseDir = session.cwd;
      log.info(`Preview baseDir=${baseDir}, filePath=${filePath}`);
      const pathResult = validateSecurePath(baseDir, filePath);
      if (!pathResult.valid) {
        log.warn(`Invalid path: ${pathResult.error}`);
        return errorResponse(pathResult.error!, 400, sentryEnabled);
      }
      const targetPath = pathResult.targetPath!;
      log.info(`Resolved path: ${targetPath}`);

      if (!existsSync(targetPath)) {
        log.warn(`File not found: ${targetPath}`);
        return errorResponse('File not found', 404, sentryEnabled);
      }

      const content = readFileSync(targetPath, 'utf-8');
      log.info(`Serving file: ${targetPath} (${content.length} bytes)`);

      const isMarkdown =
        filePath.toLowerCase().endsWith('.md') || filePath.toLowerCase().endsWith('.markdown');

      if (isMarkdown) {
        const markdownHtml = generateMarkdownPreviewHtml(content, filePath);
        return new Response(markdownHtml, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }

      return new Response(content, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    } catch (error) {
      return errorResponse(String(error), 500, sentryEnabled);
    }
  }

  // GET /api/context-files/recent
  if (apiPath.startsWith('/context-files/recent') && method === 'GET') {
    const params = new URL(req.url).searchParams;
    const sessionName = params.get('session');
    const count = Math.min(Number.parseInt(params.get('count') ?? '10', 10), 20);

    if (!sessionName) {
      return errorResponse('session parameter is required', 400, sentryEnabled);
    }

    const session = sessionManager.getSession(sessionName);
    if (!session) {
      return errorResponse(`Session "${sessionName}" not found`, 404, sentryEnabled);
    }

    try {
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

      return jsonResponse({ files: limitedFiles }, { sentryEnabled });
    } catch (error) {
      return errorResponse(String(error), 500, sentryEnabled);
    }
  }

  // GET /api/context-files/content
  if (apiPath.startsWith('/context-files/content') && method === 'GET') {
    const params = new URL(req.url).searchParams;
    const source = params.get('source') as 'plans' | 'project' | null;
    const sessionName = params.get('session');
    const filePath = params.get('path');

    if (!source || !filePath) {
      return errorResponse('source and path parameters are required', 400, sentryEnabled);
    }

    if (source !== 'plans' && source !== 'project') {
      return errorResponse('source must be "plans" or "project"', 400, sentryEnabled);
    }

    if (source === 'project' && !sessionName) {
      return errorResponse('session parameter is required for project files', 400, sentryEnabled);
    }

    try {
      let baseDir: string;
      if (source === 'plans') {
        baseDir = join(homedir(), '.claude', 'plans');
      } else {
        const sessionId = sessionName as string;
        const session = sessionManager.getSession(sessionId);
        if (!session) {
          return errorResponse(`Session "${sessionId}" not found`, 404, sentryEnabled);
        }
        baseDir = session.cwd;
      }

      const pathResult = validateSecurePath(baseDir, filePath);
      if (!pathResult.valid) {
        return errorResponse(pathResult.error!, 400, sentryEnabled);
      }
      const targetPath = pathResult.targetPath!;

      if (!existsSync(targetPath)) {
        return errorResponse('File not found', 404, sentryEnabled);
      }

      const stat = statSync(targetPath);
      const MAX_FILE_SIZE = 100 * 1024;
      if (stat.size > MAX_FILE_SIZE) {
        return errorResponse(`File too large (max ${MAX_FILE_SIZE / 1024}KB)`, 413, sentryEnabled);
      }

      const content = readFileSync(targetPath, 'utf-8');
      const name = basename(targetPath);

      return jsonResponse(
        {
          source,
          path: filePath,
          name,
          content,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString()
        },
        { sentryEnabled }
      );
    } catch (error) {
      return errorResponse(String(error), 500, sentryEnabled);
    }
  }

  return null;
}

/**
 * Generate HTML page for Markdown preview
 */
function generateMarkdownPreviewHtml(markdownContent: string, filename: string): string {
  const escapedContent = JSON.stringify(markdownContent);
  const title = basename(filename);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <script src="https://cdn.jsdelivr.net/npm/markdown-it@14/dist/markdown-it.min.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/markdown-it-cjk-friendly@1/dist/markdown-it-cjk-friendly.min.js"><\/script>
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
    const md = window.markdownit({ html: true, linkify: true, typographer: true }).use(window.markdownItCjkFriendly);
    const content = ${escapedContent};
    document.getElementById('content').innerHTML = md.render(content);
  </script>
</body>
</html>`;
}

/**
 * Collect .md files from a directory recursively
 */
interface CollectOptions {
  excludeDirs?: string[];
  maxDepth?: number;
}

interface CollectedFile {
  path: string;
  name: string;
  size: number;
  modifiedAt: string;
}

function collectMdFiles(
  dir: string,
  baseDir: string,
  options: CollectOptions = {},
  currentDepth = 0
): CollectedFile[] {
  const { excludeDirs = [], maxDepth = 5 } = options;
  const files: CollectedFile[] = [];

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
