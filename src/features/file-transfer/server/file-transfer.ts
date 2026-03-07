/**
 * File Transfer Manager
 *
 * Handles secure file upload/download operations for bunterm sessions.
 * Provides path validation, size limits, and extension filtering.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join } from 'node:path';
import { createLogger } from '@/utils/logger.js';
import { resolveSecurePath } from '@/utils/path-security.js';

const log = createLogger('file-transfer');

// =============================================================================
// Types
// =============================================================================

export interface FileTransferConfig {
  /** Maximum file size in bytes (default: 100MB) */
  max_file_size: number;
  /** Allowed file extensions (empty = all allowed) */
  allowed_extensions: string[];
  /** Enable/disable file transfer */
  enabled: boolean;
}

export const DEFAULT_FILE_TRANSFER_CONFIG: FileTransferConfig = {
  max_file_size: 100 * 1024 * 1024, // 100MB
  allowed_extensions: [],
  enabled: true
};

export interface FileInfo {
  name: string;
  size: number;
  isDirectory: boolean;
  modifiedAt: string;
  /** For directories in preview mode: true if index.html exists recursively */
  hasIndexHtml?: boolean;
}

export interface ListFilesOptions {
  /** Check if directories contain index.html recursively (for preview mode) */
  checkIndexHtml?: boolean;
}

export type FileTransferError =
  | 'not_found'
  | 'invalid_path'
  | 'file_too_large'
  | 'disabled'
  | 'extension_not_allowed'
  | 'permission_denied'
  | 'unknown';

export interface DownloadResult {
  success: boolean;
  data?: Buffer;
  filename?: string;
  mimeType?: string;
  error?: FileTransferError;
}

export interface UploadResult {
  success: boolean;
  path?: string;
  error?: FileTransferError;
}

export interface ListResult {
  success: boolean;
  files?: FileInfo[];
  error?: FileTransferError;
}

// =============================================================================
// Recent files types
// =============================================================================

export interface RecentFilesOptions {
  /** File extensions to include (e.g., ['.html', '.htm', '.md', '.txt']) */
  extensions: string[];
  /** Maximum number of files to return */
  maxCount: number;
  /** Maximum directory depth for recursion (default: 5) */
  maxDepth?: number;
  /** Source for recent files: 'scan' (default) or 'claude-history' */
  source?: 'scan' | 'claude-history';
}

export interface RecentFileInfo {
  /** Relative path from base directory (e.g., "docs/guide.md") */
  path: string;
  /** File name only (e.g., "guide.md") */
  name: string;
  /** ISO 8601 timestamp of last modification */
  modifiedAt: string;
  /** File size in bytes */
  size: number;
}

export interface RecentFilesResult {
  success: boolean;
  files?: RecentFileInfo[];
  error?: FileTransferError;
}

export interface FileTransferManager {
  downloadFile(relativePath: string): Promise<DownloadResult>;
  uploadFile(relativePath: string, content: Buffer): Promise<UploadResult>;
  listFiles(relativePath: string, options?: ListFilesOptions): Promise<ListResult>;
  findRecentFiles(options: RecentFilesOptions): Promise<RecentFilesResult>;
}

// =============================================================================
// Clipboard image types
// =============================================================================

export interface ClipboardImageInput {
  /** Base64 encoded image data */
  data: string;
  /** MIME type (e.g., 'image/png') */
  mimeType: string;
  /** Optional filename */
  name?: string;
}

export interface SaveClipboardImagesResult {
  success: boolean;
  paths?: string[];
  error?: string;
}

// =============================================================================
// Path validation (re-exported from utils for backward compatibility)
// =============================================================================

// biome-ignore lint/performance/noBarrelFile: intentional re-export for API surface
export { isPathSafe } from '@/utils/path-security.js';

/**
 * Resolve a relative path within a base directory
 * @deprecated Use resolveSecurePath from @/utils/path-security.js directly
 */
export const resolveFilePath = resolveSecurePath;

// =============================================================================
// MIME type detection
// =============================================================================

const MIME_TYPES: Record<string, string> = {
  '.txt': 'text/plain',
  '.log': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.xml': 'application/xml',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.ts': 'text/typescript',
  '.sh': 'application/x-sh',
  '.bash': 'application/x-sh',
  '.py': 'text/x-python',
  '.rb': 'text/x-ruby',
  '.go': 'text/x-go',
  '.rs': 'text/x-rust',
  '.c': 'text/x-c',
  '.cpp': 'text/x-c++',
  '.h': 'text/x-c',
  '.java': 'text/x-java',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.bz2': 'application/x-bzip2'
};

function getMimeType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

// =============================================================================
// Index.html recursive check helper
// =============================================================================

/** Directories to skip when searching for index.html */
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.svn',
  '__pycache__',
  '.cache',
  '.next',
  '.nuxt',
  'vendor',
  'bower_components'
]);

/**
 * Check if a directory contains index.html recursively
 * @param dirPath - Directory to check
 * @param maxDepth - Maximum recursion depth (default: 5)
 * @returns true if index.html exists in the directory or its subdirectories
 */
function hasIndexHtmlRecursive(dirPath: string, maxDepth = 5): boolean {
  if (maxDepth <= 0) {
    return false;
  }

  // Skip directories that shouldn't be searched
  const dirName = basename(dirPath);
  if (SKIP_DIRECTORIES.has(dirName) || dirName.startsWith('.')) {
    return false;
  }

  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      // Check for index.html directly
      if (entry.name === 'index.html' && entry.isFile()) {
        return true;
      }

      // Recurse into subdirectories (skip certain directories)
      if (entry.isDirectory() && !SKIP_DIRECTORIES.has(entry.name) && !entry.name.startsWith('.')) {
        const subPath = join(dirPath, entry.name);
        if (hasIndexHtmlRecursive(subPath, maxDepth - 1)) {
          return true;
        }
      }
    }
  } catch {
    // Permission denied or other errors - ignore
  }

  return false;
}

// =============================================================================
// FileTransferManager implementation
// =============================================================================

interface FileTransferManagerOptions {
  baseDir: string;
  config?: FileTransferConfig;
}

export function createFileTransferManager(
  options: FileTransferManagerOptions
): FileTransferManager {
  const { baseDir, config = DEFAULT_FILE_TRANSFER_CONFIG } = options;

  async function downloadFile(relativePath: string): Promise<DownloadResult> {
    // Check if transfer is enabled
    if (!config.enabled) {
      return { success: false, error: 'disabled' };
    }

    // Validate and resolve path
    const resolvedPath = resolveFilePath(baseDir, relativePath);
    if (!resolvedPath) {
      return { success: false, error: 'invalid_path' };
    }

    // Check if file exists
    if (!existsSync(resolvedPath)) {
      return { success: false, error: 'not_found' };
    }

    try {
      // Check file size before reading
      const stats = statSync(resolvedPath);
      if (stats.size > config.max_file_size) {
        return { success: false, error: 'file_too_large' };
      }

      // Read file content
      const data = await readFile(resolvedPath);
      const filename = basename(resolvedPath);
      const mimeType = getMimeType(filename);

      log.info(`Downloaded file: ${relativePath} (${stats.size} bytes)`);

      return {
        success: true,
        data,
        filename,
        mimeType
      };
    } catch (err) {
      log.error(`Failed to download file: ${relativePath}`, err);
      return { success: false, error: 'unknown' };
    }
  }

  async function uploadFile(relativePath: string, content: Buffer): Promise<UploadResult> {
    // Check if transfer is enabled
    if (!config.enabled) {
      return { success: false, error: 'disabled' };
    }

    // Validate and resolve path
    const resolvedPath = resolveFilePath(baseDir, relativePath);
    if (!resolvedPath) {
      return { success: false, error: 'invalid_path' };
    }

    // Check file size
    if (content.length > config.max_file_size) {
      return { success: false, error: 'file_too_large' };
    }

    // Check extension if filter is configured
    if (config.allowed_extensions.length > 0) {
      const ext = extname(relativePath).toLowerCase();
      if (!config.allowed_extensions.includes(ext)) {
        return { success: false, error: 'extension_not_allowed' };
      }
    }

    try {
      // Create parent directory if needed
      const parentDir = dirname(resolvedPath);
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true });
      }

      // Write file
      await writeFile(resolvedPath, content);

      log.info(`Uploaded file: ${relativePath} (${content.length} bytes)`);

      return {
        success: true,
        path: relativePath
      };
    } catch (err) {
      log.error(`Failed to upload file: ${relativePath}`, err);
      return { success: false, error: 'unknown' };
    }
  }

  function listFiles(relativePath: string, options?: ListFilesOptions): Promise<ListResult> {
    // Check if transfer is enabled
    if (!config.enabled) {
      return Promise.resolve({ success: false, error: 'disabled' });
    }

    // Handle "." as current directory
    const pathToResolve = relativePath === '.' ? '' : relativePath;

    // Validate and resolve path
    const resolvedPath = pathToResolve ? resolveFilePath(baseDir, pathToResolve) : baseDir;
    if (!resolvedPath) {
      return Promise.resolve({ success: false, error: 'invalid_path' });
    }

    // Check if directory exists
    if (!existsSync(resolvedPath)) {
      return Promise.resolve({ success: false, error: 'not_found' });
    }

    try {
      const entries = readdirSync(resolvedPath, { withFileTypes: true });
      const files: FileInfo[] = [];

      for (const entry of entries) {
        const entryPath = join(resolvedPath, entry.name);
        const stats = statSync(entryPath);

        const fileInfo: FileInfo = {
          name: entry.name,
          size: stats.size,
          isDirectory: entry.isDirectory(),
          modifiedAt: stats.mtime.toISOString()
        };

        // In preview mode, check if directory contains index.html recursively
        if (options?.checkIndexHtml && entry.isDirectory()) {
          fileInfo.hasIndexHtml = hasIndexHtmlRecursive(entryPath);
        }

        files.push(fileInfo);
      }

      return Promise.resolve({
        success: true,
        files
      });
    } catch (err) {
      log.error(`Failed to list files: ${relativePath}`, err);
      return Promise.resolve({ success: false, error: 'unknown' });
    }
  }

  /**
   * Find recently edited files from Claude Code history
   */
  function findRecentFilesFromClaudeHistory(
    extensions: Set<string>,
    maxCount: number
  ): RecentFileInfo[] {
    const homeDir = process.env['HOME'] || '';
    if (!homeDir) {
      return [];
    }

    // Convert baseDir to Claude project path format
    // /home/cuzic/bunterm -> -home-cuzic-bunterm
    const projectSlug = baseDir.replace(/\//g, '-').replace(/^-/, '');
    const projectDir = join(homeDir, '.claude', 'projects', projectSlug);

    if (!existsSync(projectDir)) {
      log.debug(`Claude project directory not found: ${projectDir}`);
      return [];
    }

    // Find all JSONL transcript files, sorted by modification time (newest first)
    const jsonlFiles: Array<{ path: string; mtime: Date }> = [];
    try {
      const entries = readdirSync(projectDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          const filePath = join(projectDir, entry.name);
          const stats = statSync(filePath);
          jsonlFiles.push({ path: filePath, mtime: stats.mtime });
        }
      }
    } catch {
      return [];
    }

    jsonlFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    // Extract edited files from transcripts (newest sessions first)
    const editedFilesMap = new Map<string, { modifiedAt: string; size: number }>();

    for (const jsonlFile of jsonlFiles.slice(0, 5)) {
      // Check last 5 sessions
      try {
        const content = readFileSync(jsonlFile.path, 'utf-8');
        const lines = content.split('\n').filter((line) => line.trim());

        // Process lines in reverse to get most recent edits first
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i];
          if (!line) {
            continue;
          }
          try {
            const entry = JSON.parse(line);
            const toolUses = entry?.message?.content?.filter(
              (c: { type: string; name: string }) =>
                c.type === 'tool_use' && (c.name === 'Edit' || c.name === 'Write')
            );

            if (!toolUses) {
              continue;
            }

            for (const toolUse of toolUses) {
              const filePath = toolUse.input?.file_path;
              if (!filePath || typeof filePath !== 'string') {
                continue;
              }

              // Check if file is within baseDir
              if (!filePath.startsWith(`${baseDir}/`)) {
                continue;
              }

              // Get relative path
              const relativePath = filePath.slice(baseDir.length + 1);

              // Check extension
              const ext = extname(relativePath).toLowerCase();
              if (!extensions.has(ext)) {
                continue;
              }

              // Skip if already found (we want the most recent edit)
              if (editedFilesMap.has(relativePath)) {
                continue;
              }

              // Check if file still exists and get its current stats
              if (!existsSync(filePath)) {
                continue;
              }

              try {
                const stats = statSync(filePath);
                editedFilesMap.set(relativePath, {
                  modifiedAt: stats.mtime.toISOString(),
                  size: stats.size
                });
              } catch {
                // Skip if can't stat
              }

              // Stop early if we have enough
              if (editedFilesMap.size >= maxCount) {
                break;
              }
            }
          } catch {
            // Skip invalid JSON lines
          }

          if (editedFilesMap.size >= maxCount) {
            break;
          }
        }
      } catch {
        // Skip files we can't read
      }

      if (editedFilesMap.size >= maxCount) {
        break;
      }
    }

    // Convert to array and sort by modification time
    const results: RecentFileInfo[] = [];
    for (const [relativePath, info] of editedFilesMap) {
      results.push({
        path: relativePath,
        name: basename(relativePath),
        modifiedAt: info.modifiedAt,
        size: info.size
      });
    }

    results.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

    return results.slice(0, maxCount);
  }

  /**
   * Find recently modified files matching specified extensions
   */
  function findRecentFiles(options: RecentFilesOptions): Promise<RecentFilesResult> {
    // Check if transfer is enabled
    if (!config.enabled) {
      return Promise.resolve({ success: false, error: 'disabled' });
    }

    const { extensions, maxCount, maxDepth = 5, source = 'scan' } = options;

    // Normalize extensions to lowercase
    const normalizedExtensions = new Set(extensions.map((ext) => ext.toLowerCase()));

    // Use Claude Code history if requested (with fallback to scan)
    if (source === 'claude-history') {
      try {
        const files = findRecentFilesFromClaudeHistory(normalizedExtensions, maxCount);
        if (files.length > 0) {
          log.debug(`Found ${files.length} recent files from Claude history`);
          return Promise.resolve({ success: true, files });
        }
        // Fallback to filesystem scan if no files found in Claude history
        log.debug('No files found in Claude history, falling back to filesystem scan');
      } catch (err) {
        log.debug(`Claude history unavailable, falling back to scan: ${err}`);
      }
      // Continue to filesystem scan below
    }

    // Default: scan filesystem
    const recentFiles: RecentFileInfo[] = [];

    /**
     * Recursively scan directory for matching files
     */
    function scanDirectory(dirPath: string, relativePath: string, currentDepth: number): void {
      if (currentDepth > maxDepth) {
        return;
      }

      const dirName = basename(dirPath);

      // Skip hidden directories and common non-content directories
      if (dirName.startsWith('.') || SKIP_DIRECTORIES.has(dirName)) {
        return;
      }

      try {
        const entries = readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const entryPath = join(dirPath, entry.name);
          const entryRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

          if (entry.isDirectory()) {
            // Recurse into subdirectories
            scanDirectory(entryPath, entryRelativePath, currentDepth + 1);
          } else if (entry.isFile()) {
            // Check file extension
            const ext = extname(entry.name).toLowerCase();
            if (normalizedExtensions.has(ext)) {
              try {
                const stats = statSync(entryPath);
                recentFiles.push({
                  path: entryRelativePath,
                  name: entry.name,
                  modifiedAt: stats.mtime.toISOString(),
                  size: stats.size
                });
              } catch {
                // Skip files we can't stat
              }
            }
          }
        }
      } catch {
        // Skip directories we can't read
      }
    }

    try {
      // Start scanning from base directory
      scanDirectory(baseDir, '', 0);

      // Sort by modification time (newest first)
      recentFiles.sort((a, b) => {
        return new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime();
      });

      // Return top N files
      const topFiles = recentFiles.slice(0, maxCount);

      log.debug(`Found ${recentFiles.length} recent files, returning top ${topFiles.length}`);

      return Promise.resolve({
        success: true,
        files: topFiles
      });
    } catch (err) {
      log.error('Failed to find recent files', err);
      return Promise.resolve({ success: false, error: 'unknown' });
    }
  }

  return {
    downloadFile,
    uploadFile,
    listFiles,
    findRecentFiles
  };
}

// =============================================================================
// Clipboard image saving
// =============================================================================

// Regex patterns for timestamp formatting
const TIMESTAMP_CHARS_REGEX = /[-:]/g;
const TIMESTAMP_MILLIS_REGEX = /\.\d{3}Z/;

/**
 * Get file extension from MIME type
 */
function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff'
  };
  return mimeToExt[mimeType] || 'png';
}

/**
 * Generate a unique filename for clipboard images
 */
function generateClipboardFilename(mimeType: string, index: number): string {
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(TIMESTAMP_CHARS_REGEX, '')
    .replace('T', '-')
    .replace(TIMESTAMP_MILLIS_REGEX, '');
  const ext = getExtensionFromMimeType(mimeType);
  const suffix = index > 0 ? `-${String(index + 1).padStart(3, '0')}` : '';
  return `clipboard-${timestamp}${suffix}.${ext}`;
}

/**
 * Get the clipboard images directory in /tmp
 */
function getClipboardTmpDir(): string {
  const dir = join(tmpdir(), 'bunterm-clipboard');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Save clipboard images to /tmp/bunterm-clipboard directory
 * Returns absolute paths to the saved files
 */
export async function saveClipboardImages(
  _baseDir: string,
  images: ClipboardImageInput[],
  config?: FileTransferConfig
): Promise<SaveClipboardImagesResult> {
  const effectiveConfig = config || DEFAULT_FILE_TRANSFER_CONFIG;

  // Check if transfer is enabled
  if (!effectiveConfig.enabled) {
    return { success: false, error: 'File transfer is disabled' };
  }

  if (!images || images.length === 0) {
    return { success: false, error: 'No images provided' };
  }

  // Use /tmp directory for clipboard images
  const saveDir = getClipboardTmpDir();
  const savedPaths: string[] = [];

  try {
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      if (!image) {
        continue;
      }

      // Decode base64 data
      const buffer = Buffer.from(image.data, 'base64');

      // Check file size
      if (buffer.length > effectiveConfig.max_file_size) {
        return {
          success: false,
          error: `Image ${i + 1} exceeds maximum file size (${Math.round(effectiveConfig.max_file_size / 1024 / 1024)}MB)`
        };
      }

      // Generate or use provided filename
      const filename = image.name ?? generateClipboardFilename(image.mimeType, i);

      // Resolve the full path in /tmp
      const fullPath = join(saveDir, filename);

      // Write the file
      await writeFile(fullPath, buffer);

      // Store absolute path for response
      savedPaths.push(fullPath);

      log.info(`Saved clipboard image: ${fullPath} (${buffer.length} bytes)`);
    }

    return {
      success: true,
      paths: savedPaths
    };
  } catch (err) {
    log.error('Failed to save clipboard images', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }
}
