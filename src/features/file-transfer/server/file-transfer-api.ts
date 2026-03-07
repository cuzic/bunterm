/**
 * File Transfer API Handlers
 *
 * HTTP handlers for file upload/download endpoints.
 */

import type { ServerResponse } from 'node:http';
import type { FileTransferManager, ListFilesOptions, RecentFilesOptions } from './file-transfer.js';

// =============================================================================
// Response helpers
// =============================================================================

function sendJsonError(res: ServerResponse, status: number, error: string): void {
  const body = JSON.stringify({ error });
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function sendJsonSuccess(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

// =============================================================================
// Error code to HTTP status mapping
// =============================================================================

const ERROR_STATUS_MAP: Record<string, { status: number; message: string }> = {
  not_found: { status: 404, message: 'File not found' },
  invalid_path: { status: 400, message: 'Invalid file path' },
  file_too_large: { status: 413, message: 'File too large' },
  disabled: { status: 403, message: 'File transfer is disabled' },
  extension_not_allowed: { status: 403, message: 'File extension not allowed' },
  permission_denied: { status: 403, message: 'Permission denied' },
  unknown: { status: 500, message: 'Internal server error' }
};

const UNKNOWN_ERROR = { status: 500, message: 'Internal server error' };

function getErrorInfo(errorCode: string | undefined): { status: number; message: string } {
  return ERROR_STATUS_MAP[errorCode ?? 'unknown'] ?? UNKNOWN_ERROR;
}

// =============================================================================
// Content-Disposition filename sanitization
// =============================================================================

/**
 * Sanitize filename for Content-Disposition header
 * Prevents header injection and XSS attacks
 */
function sanitizeFilenameForHeader(filename: string): string {
  // Remove or replace dangerous characters
  // Only allow alphanumeric, dash, underscore, dot, and space
  const sanitized = filename
    .replace(/[^\w\s.\-]/g, '_') // Replace special chars with underscore
    .replace(/\s+/g, '_') // Replace whitespace with underscore
    .slice(0, 255); // Limit length

  // Ensure filename is not empty
  return sanitized || 'download';
}

/**
 * Generate RFC 5987 encoded Content-Disposition header value
 * Supports non-ASCII filenames safely
 */
function getContentDisposition(filename: string): string {
  const sanitized = sanitizeFilenameForHeader(filename);
  // Use both filename (ASCII fallback) and filename* (UTF-8 encoded)
  const encoded = encodeURIComponent(sanitized);
  return `attachment; filename="${sanitized}"; filename*=UTF-8''${encoded}`;
}

// =============================================================================
// Download handler
// =============================================================================

/**
 * Handle file download request
 */
export async function handleFileDownload(
  manager: FileTransferManager,
  path: string,
  res: ServerResponse
): Promise<void> {
  const result = await manager.downloadFile(path);

  if (!result.success) {
    const errorInfo = getErrorInfo(result.error);
    sendJsonError(res, errorInfo.status, errorInfo.message);
    return;
  }

  // Set headers for file download
  res.writeHead(200, {
    'Content-Type': result.mimeType ?? 'application/octet-stream',
    'Content-Disposition': getContentDisposition(result.filename ?? 'download'),
    'Content-Length': result.data?.length ?? 0
  });
  res.end(result.data);
}

// =============================================================================
// Upload handler
// =============================================================================

/**
 * Handle file upload request
 */
export async function handleFileUpload(
  manager: FileTransferManager,
  path: string,
  content: Buffer,
  res: ServerResponse
): Promise<void> {
  const result = await manager.uploadFile(path, content);

  if (!result.success) {
    const errorInfo = getErrorInfo(result.error);
    sendJsonError(res, errorInfo.status, errorInfo.message);
    return;
  }

  sendJsonSuccess(res, 201, {
    success: true,
    path: result.path
  });
}

// =============================================================================
// List handler
// =============================================================================

/**
 * Handle file list request
 */
export async function handleFileList(
  manager: FileTransferManager,
  path: string,
  res: ServerResponse,
  options?: ListFilesOptions
): Promise<void> {
  const result = await manager.listFiles(path, options);

  if (!result.success) {
    const errorInfo =
      result.error === 'not_found'
        ? { status: 404, message: 'Directory not found' }
        : getErrorInfo(result.error);
    sendJsonError(res, errorInfo.status, errorInfo.message);
    return;
  }

  sendJsonSuccess(res, 200, {
    files: result.files
  });
}

// =============================================================================
// Recent files handler
// =============================================================================

/**
 * Handle recent files request
 */
export async function handleRecentFiles(
  manager: FileTransferManager,
  res: ServerResponse,
  options: RecentFilesOptions
): Promise<void> {
  const result = await manager.findRecentFiles(options);

  if (!result.success) {
    const errorInfo = getErrorInfo(result.error);
    sendJsonError(res, errorInfo.status, errorInfo.message);
    return;
  }

  sendJsonSuccess(res, 200, {
    files: result.files
  });
}

// =============================================================================
// Multipart parsing
// =============================================================================

interface ParsedFile {
  filename: string;
  content: Buffer;
}

// Regex pattern for filename extraction in multipart parsing
const FILENAME_REGEX = /filename="([^"]+)"/;

/**
 * Parse multipart form data to extract file
 */
export function parseMultipartFile(body: Buffer, boundary: string): ParsedFile | null {
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const headerEndMarker = Buffer.from('\r\n\r\n');

  // Find the first boundary
  let start = body.indexOf(boundaryBuffer);
  if (start === -1) {
    return null;
  }

  // Skip boundary and CRLF
  start += boundaryBuffer.length + 2;

  // Find header end
  const headerEnd = body.indexOf(headerEndMarker, start);
  if (headerEnd === -1) {
    return null;
  }

  // Parse headers
  const headerStr = body.slice(start, headerEnd).toString();

  // Extract filename from Content-Disposition
  const filenameMatch = headerStr.match(FILENAME_REGEX);
  if (!filenameMatch?.[1]) {
    return null;
  }
  const filename = filenameMatch[1];

  // Find content start and end
  const contentStart = headerEnd + 4; // Skip \r\n\r\n

  // Find closing boundary
  const closingBoundary = Buffer.from(`\r\n--${boundary}`);
  const contentEnd = body.indexOf(closingBoundary, contentStart);
  if (contentEnd === -1) {
    return null;
  }

  // Extract content
  const content = body.slice(contentStart, contentEnd);

  return {
    filename,
    content
  };
}

/**
 * Extract boundary from Content-Type header
 * Uses string parsing instead of regex for security
 */
export function extractBoundary(contentType: string): string | null {
  // Limit Content-Type header length to prevent DoS
  if (contentType.length > 500) {
    return null;
  }

  const boundaryIndex = contentType.indexOf('boundary=');
  if (boundaryIndex === -1) {
    return null;
  }

  let boundary = contentType.slice(boundaryIndex + 9);

  // Handle quoted boundary
  if (boundary.startsWith('"')) {
    const endQuote = boundary.indexOf('"', 1);
    if (endQuote === -1) {
      return null;
    }
    boundary = boundary.slice(1, endQuote);
  } else {
    // Unquoted: take until semicolon or end
    const semicolon = boundary.indexOf(';');
    if (semicolon !== -1) {
      boundary = boundary.slice(0, semicolon);
    }
    boundary = boundary.trim();
  }

  // Validate boundary (RFC 2046: 1-70 chars, specific character set)
  if (boundary.length === 0 || boundary.length > 70) {
    return null;
  }

  return boundary;
}
