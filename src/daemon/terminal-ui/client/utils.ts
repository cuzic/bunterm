/**
 * Toolbar Client Utilities
 *
 * Shared utility functions for toolbar client modules.
 */

/**
 * Check if the current device is a mobile device
 */
export const isMobileDevice = (): boolean =>
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

/**
 * Extract session name from URL path
 * @param basePath - The base path prefix (e.g., '/ttyd-mux')
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
