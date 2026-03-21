/**
 * Toolbar Client Utilities
 *
 * Shared utility functions for toolbar client modules.
 */

import { type Scope, on } from './lifecycle.js';

/** Mobile device detection regex (top-level for performance) */
const MOBILE_REGEX = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

/**
 * Check if the current device is a mobile device
 */
export const isMobileDevice = (): boolean => MOBILE_REGEX.test(navigator.userAgent);

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

/**
 * Copy text to clipboard with consistent error handling
 * @param text - The text to copy
 * @returns True if copy succeeded, false otherwise
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!navigator.clipboard) {
    console.warn('Clipboard API not available');
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
}

/**
 * Read text from clipboard
 * @returns Clipboard text or null if failed
 */
export async function readClipboardText(): Promise<string | null> {
  if (!navigator.clipboard) {
    console.warn('Clipboard API not available');
    return null;
  }
  try {
    return await navigator.clipboard.readText();
  } catch (error) {
    console.error('Failed to read clipboard:', error);
    return null;
  }
}

/**
 * Escape HTML special characters using string replacement
 * More efficient than DOM-based escaping
 * @param text - The text to escape
 * @returns Escaped HTML string
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
