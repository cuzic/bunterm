/**
 * Toolbar Client Utilities
 *
 * Shared utility functions for toolbar client modules.
 */

import { type Scope, on } from './lifecycle.js';

/**
 * Check if the current device is a mobile device
 */
export const isMobileDevice = (): boolean =>
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

/**
 * Extract session name from URL path
 * @param basePath - The base path prefix (e.g., '/bunterm')
 * @returns Session name or empty string if not found
 */
export function getSessionNameFromURL(basePath: string): string {
  // Normalize basePath: remove leading/trailing slashes
  const normalizedBase = basePath.replace(/^\/|\/$/g, '');
  const pathname = window.location.pathname;

  // Match pattern: /<basePath>/<sessionName>/...
  const pattern = new RegExp(`^/${normalizedBase}/([^/]+)`);
  const match = pathname.match(pattern);

  return match?.[1] ?? '';
}

/**
 * Bind a click event handler to an element with preventDefault
 * @param element - The element to bind to (null-safe)
 * @param handler - The click handler function
 * @returns Cleanup function to remove the listener
 * @deprecated Use bindClickScoped with a Scope for automatic cleanup
 */
export function bindClick(
  element: HTMLElement | null,
  handler: (e: MouseEvent) => void
): () => void {
  if (!element) {
    return () => {};
  }

  const wrappedHandler = (e: MouseEvent) => {
    e.preventDefault();
    handler(e);
  };

  element.addEventListener('click', wrappedHandler);

  return () => element.removeEventListener('click', wrappedHandler);
}

/**
 * Bind a click event handler to an element with automatic cleanup via Scope.
 * @param scope - Scope for automatic cleanup
 * @param element - The element to bind to (null-safe)
 * @param handler - The click handler function
 */
export function bindClickScoped(
  scope: Scope,
  element: HTMLElement | null,
  handler: (e?: MouseEvent) => void
): void {
  if (!element) {
    return;
  }

  scope.add(
    on(element, 'click', (e: Event) => {
      e.preventDefault();
      handler(e as MouseEvent);
    })
  );
}

/**
 * Truncate text to a maximum length with ellipsis
 * @param text - The text to truncate
 * @param maxLength - Maximum length before truncation
 * @param suffix - Suffix to append when truncated (default: '...')
 * @returns Truncated text
 */
export function truncateText(text: string, maxLength: number, suffix = '...'): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - suffix.length) + suffix;
}

/** Default preview allowed extensions (fallback if not provided by server) */
const DEFAULT_PREVIEW_EXTENSIONS = ['.html', '.htm', '.md', '.txt'];

/**
 * Check if a file is previewable based on its extension
 * @param filename - The filename to check
 * @param allowedExtensions - Array of allowed extensions (uses default if not provided)
 * @returns True if the file is previewable
 */
export function isPreviewable(filename: string, allowedExtensions?: string[]): boolean {
  const extensions = allowedExtensions ?? DEFAULT_PREVIEW_EXTENSIONS;
  const lowerName = filename.toLowerCase();
  return extensions.some((ext) => lowerName.endsWith(ext.toLowerCase()));
}

/**
 * Convert a Blob to base64 string
 * @param blob - The blob to convert
 * @returns Base64 encoded string
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  return btoa(
    new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
  );
}
