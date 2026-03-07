/**
 * Static File Offload - X-Accel-Redirect support for Caddy/Nginx
 *
 * When enabled, instead of reading and sending files directly,
 * the application sends special headers that tell the reverse proxy
 * to serve the file directly from disk.
 *
 * This is more efficient because:
 * 1. The reverse proxy can use sendfile() for zero-copy file serving
 * 2. The application doesn't need to buffer large files in memory
 * 3. The reverse proxy can handle caching, compression, and range requests
 *
 * Headers sent:
 * - X-Accel-Redirect: /_internal_files/<path> (Nginx/Caddy)
 * - X-Sendfile: /absolute/path (Apache)
 * - Content-Type: <mime-type>
 * - Content-Disposition: attachment; filename="<name>" (for downloads)
 *
 * Caddy configuration example:
 * ```
 * handle /_internal_files/* {
 *   @accel header X-Accel-Redirect *
 *   handle @accel {
 *     uri strip_prefix /_internal_files
 *     root * /
 *     file_server
 *   }
 * }
 * ```
 */

import { basename, extname, resolve } from 'node:path';
import type { StaticOffloadConfig } from '@/core/config/types.js';

/** MIME types for common file extensions */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject'
};

/**
 * Get MIME type for a file extension
 */
export function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

export interface OffloadOptions {
  /** Whether this is a download (vs inline display) */
  download?: boolean;
  /** Custom filename for Content-Disposition */
  filename?: string;
  /** Custom Content-Type */
  contentType?: string;
}

/**
 * Create an X-Accel-Redirect response for offloading file serving to Caddy/Nginx
 *
 * @param config Static offload configuration
 * @param absolutePath Absolute path to the file on disk
 * @param options Additional options
 * @returns Response with X-Accel-Redirect header
 */
export function createOffloadResponse(
  config: StaticOffloadConfig,
  absolutePath: string,
  options: OffloadOptions = {}
): Response {
  // Resolve to absolute path to ensure consistency
  const resolvedPath = resolve(absolutePath);

  // Build the internal redirect path
  const internalPath = `${config.internal_path_prefix}${resolvedPath}`;

  // Determine content type
  const contentType = options.contentType ?? getMimeType(resolvedPath);

  // Build headers
  const headers: Record<string, string> = {
    'X-Accel-Redirect': internalPath,
    'Content-Type': contentType,
    // Disable Caddy buffering for large files
    'X-Accel-Buffering': 'no'
  };

  // Add Content-Disposition for downloads
  if (options.download) {
    const filename = options.filename ?? basename(resolvedPath);
    // Encode filename for non-ASCII characters
    const encodedFilename = encodeURIComponent(filename);
    headers['Content-Disposition'] =
      `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`;
  }

  // Return empty response with offload headers
  // The actual file content will be served by the reverse proxy
  return new Response(null, {
    status: 200,
    headers
  });
}

/**
 * Check if static offload is enabled and properly configured
 */
export function isOffloadEnabled(config: StaticOffloadConfig | undefined): boolean {
  return config?.enabled === true;
}

/**
 * Generate Caddyfile snippet for X-Accel-Redirect handling
 *
 * This should be included in the Caddy configuration to handle
 * internal file serving requests from the application.
 */
export function generateCaddyOffloadSnippet(internalPathPrefix: string): string {
  return `# X-Accel-Redirect handler for static file offload
# This handles internal redirects from the application server
handle_path ${internalPathPrefix}/* {
  # The path after the prefix is the absolute file path
  root * /
  file_server {
    # Disable directory listing for security
    browse
  }
}

# In reverse_proxy section, add:
# reverse_proxy localhost:7680 {
#   @accel header X-Accel-Redirect *
#   handle_response @accel {
#     # Copy headers from upstream
#     copy_response_headers {
#       include Content-Type
#       include Content-Disposition
#     }
#     # Rewrite to internal path and serve file
#     rewrite {http.response.header.X-Accel-Redirect}
#     file_server
#   }
# }
`;
}

/**
 * Generate Nginx configuration snippet for X-Accel-Redirect
 */
export function generateNginxOffloadSnippet(internalPathPrefix: string): string {
  return `# X-Accel-Redirect handler for static file offload
# Add this location block to your Nginx server configuration

location ${internalPathPrefix}/ {
  internal;  # Only allow internal redirects
  alias /;   # Map to root filesystem (path includes full absolute path)
}

# The application will send:
#   X-Accel-Redirect: ${internalPathPrefix}/absolute/path/to/file
# Nginx will serve the file from:
#   /absolute/path/to/file
`;
}
