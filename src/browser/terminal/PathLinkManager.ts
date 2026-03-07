/**
 * PathLinkManager - File path detection and interactive link handling
 *
 * This module detects file paths in terminal output and converts them
 * to interactive links with an action popup (Preview / Download / Copy).
 */

import type { IBufferLine, IDisposable, ILink, ILinkProvider, Terminal } from '@xterm/xterm';

// Top-level regex patterns for performance
const URL_PROTOCOL_PATTERN = /https?:\/?\/?$/;
const VERSION_NUMBER_PATTERN = /^v?\d+\.\d+\.\d+/;
const LOCALHOST_PATTERN = /^(localhost|127\.0\.0\.\d+|\[?::1\]?)/;

/**
 * Parsed file path with optional line/column numbers
 */
export interface PathLink {
  /** The file path as detected in the text */
  path: string;
  /** Resolved absolute path (for API calls) */
  fullPath: string;
  /** Optional line number */
  line?: number;
  /** Optional column number */
  column?: number;
  /** Text range in the line */
  range: { start: number; end: number };
}

/**
 * Options for PathLinkManager
 */
export interface PathLinkManagerOptions {
  /** The xterm.js Terminal instance */
  terminal: Terminal;
  /** Session name for API calls */
  sessionName: string;
  /** Base path for URLs (e.g., '/bunterm') */
  basePath: string;
  /** Current working directory of the session */
  cwd: string;
}

/**
 * Manages file path detection and interactive link handling
 */
export class PathLinkManager {
  private terminal: Terminal;
  private sessionName: string;
  private basePath: string;
  private cwd: string;
  private popup: HTMLElement | null = null;
  private currentLink: PathLink | null = null;
  private disposables: IDisposable[] = [];
  private hidePopupTimer: number | null = null;

  constructor(options: PathLinkManagerOptions) {
    this.terminal = options.terminal;
    this.sessionName = options.sessionName;
    this.basePath = options.basePath;
    this.cwd = options.cwd;
  }

  /**
   * Register the link provider with the terminal
   */
  register(): IDisposable {
    const provider: ILinkProvider = {
      provideLinks: (bufferLineNumber: number, callback: (links: ILink[] | undefined) => void) => {
        const links = this.detectLinksInLine(bufferLineNumber);
        callback(links.length > 0 ? links : undefined);
      }
    };

    const disposable = this.terminal.registerLinkProvider(provider);
    this.disposables.push(disposable);

    // Create popup element
    this.createPopup();

    // Setup click-outside handler
    this.setupClickOutside();

    return {
      dispose: () => this.dispose()
    };
  }

  /**
   * Detect file paths in a specific line
   */
  private detectLinksInLine(bufferLineNumber: number): ILink[] {
    const buffer = this.terminal.buffer.active;
    const line = buffer.getLine(bufferLineNumber);
    if (!line) {
      return [];
    }

    const lineText = this.getLineText(line);
    const paths = this.detectPaths(lineText);
    const links: ILink[] = [];

    for (const pathLink of paths) {
      const link: ILink = {
        range: {
          start: { x: pathLink.range.start + 1, y: bufferLineNumber + 1 },
          end: { x: pathLink.range.end + 1, y: bufferLineNumber + 1 }
        },
        text: this.formatLinkText(pathLink),
        activate: (event: MouseEvent, _text: string) => {
          this.showPopup(pathLink, event);
        },
        hover: (_event: MouseEvent, _text: string) => {
          // Clear any pending hide timer when hovering
          this.clearHideTimer();
        },
        leave: (_event: MouseEvent, _text: string) => {
          // Schedule hide after a short delay (allows moving to popup)
          this.scheduleHidePopup();
        }
      };
      links.push(link);
    }

    return links;
  }

  /**
   * Get text content from a buffer line
   */
  private getLineText(line: IBufferLine): string {
    let text = '';
    for (let i = 0; i < line.length; i++) {
      const cell = line.getCell(i);
      if (cell) {
        text += cell.getChars() || ' ';
      }
    }
    return text;
  }

  /**
   * Detect file paths in a line of text
   * Based on BlockManager.extractFilePaths with enhancements
   */
  private detectPaths(lineText: string): PathLink[] {
    const results: PathLink[] = [];

    // Combined patterns for various file path formats:
    // 1. Absolute paths: /path/to/file.ext:line:col
    // 2. Relative paths: ./path, ../path, path/to/file.ext
    // 3. TypeScript/JS error format: file.ts(10,5)
    // 4. Python traceback: File "path", line 10
    // 5. Go/Rust error: path.go:10:5:
    const patterns = [
      // Standard paths with optional :line:col
      // Matches: /path/file.ts:10:5, ./src/index.ts:42, file.js:100
      /(?:^|[\s"'`(,=])((\.\.?\/)?[a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)(?::(\d+)(?::(\d+))?)?(?=[\s"'`),;:]|$)/g,

      // TypeScript/JS error format: file.ts(10,5)
      /(?:^|[\s"'`(,=])([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)\((\d+),(\d+)\)/g,

      // Python traceback: File "path/file.py", line 10
      /File\s+"([^"]+)",\s+line\s+(\d+)/g
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      const regex = new RegExp(pattern.source, pattern.flags);

      while ((match = regex.exec(lineText)) !== null) {
        let pathStr: string;
        let line: number | undefined;
        let column: number | undefined;
        let startOffset = 0;

        // Handle different pattern match groups
        if (pattern.source.includes('File\\s+"')) {
          // Python traceback pattern
          pathStr = match[1] ?? '';
          line = match[2] ? Number.parseInt(match[2], 10) : undefined;
          // Find the actual start position in the line
          startOffset = match.index + match[0].indexOf('"') + 1;
        } else if (pattern.source.includes('\\(\\d+,\\d+\\)')) {
          // TypeScript (line,col) pattern
          pathStr = match[1] ?? '';
          line = match[2] ? Number.parseInt(match[2], 10) : undefined;
          column = match[3] ? Number.parseInt(match[3], 10) : undefined;
          // Calculate start offset (skip leading delimiters)
          const fullMatch = match[0];
          startOffset = match.index + (fullMatch.length - fullMatch.trimStart().length);
        } else {
          // Standard path pattern
          pathStr = match[1] ?? '';
          line = match[3] ? Number.parseInt(match[3], 10) : undefined;
          column = match[4] ? Number.parseInt(match[4], 10) : undefined;
          // Calculate start offset (skip leading delimiters)
          const fullMatch = match[0];
          startOffset = match.index + (fullMatch.length - fullMatch.trimStart().length);
        }

        // Skip invalid paths
        if (!pathStr || !this.isValidPath(pathStr, lineText, match.index)) {
          continue;
        }

        // Calculate the full display text length
        let displayLength = pathStr.length;
        if (line !== undefined) {
          displayLength += `:${line}`.length;
          if (column !== undefined) {
            displayLength += `:${column}`.length;
          }
        }

        // Check for duplicates
        const isDuplicate = results.some(
          (r) => r.path === pathStr && r.range.start === startOffset
        );
        if (isDuplicate) {
          continue;
        }

        results.push({
          path: pathStr,
          fullPath: this.resolveFullPath(pathStr),
          line,
          column,
          range: {
            start: startOffset,
            end: startOffset + displayLength
          }
        });
      }
    }

    return results;
  }

  /**
   * Check if a detected path is valid (not a URL or email)
   */
  private isValidPath(path: string, fullText: string, matchIndex: number): boolean {
    // Must have an extension
    const parts = path.split('/');
    const fileName = parts[parts.length - 1] ?? '';
    if (!fileName.includes('.')) {
      return false;
    }

    // Skip URLs (check preceding text for protocol)
    const precedingText = fullText.slice(Math.max(0, matchIndex - 10), matchIndex);
    if (URL_PROTOCOL_PATTERN.test(precedingText)) {
      return false;
    }

    // Skip email-like patterns
    if (path.includes('@')) {
      return false;
    }

    // Skip version numbers like v1.2.3
    if (VERSION_NUMBER_PATTERN.test(path)) {
      return false;
    }

    // Skip common non-file patterns
    if (LOCALHOST_PATTERN.test(path)) {
      return false;
    }

    return true;
  }

  /**
   * Resolve a path to an absolute path
   */
  private resolveFullPath(path: string): string {
    if (path.startsWith('/')) {
      return path;
    }
    // Resolve relative paths against cwd
    if (path.startsWith('./')) {
      return `${this.cwd}/${path.slice(2)}`;
    }
    if (path.startsWith('../')) {
      // Simple parent directory handling
      const cwdParts = this.cwd.split('/');
      const pathParts = path.split('/');
      while (pathParts[0] === '..') {
        cwdParts.pop();
        pathParts.shift();
      }
      return `${cwdParts.join('/')}/${pathParts.join('/')}`;
    }
    return `${this.cwd}/${path}`;
  }

  /**
   * Format link text for display
   */
  private formatLinkText(link: PathLink): string {
    let text = link.path;
    if (link.line !== undefined) {
      text += `:${link.line}`;
      if (link.column !== undefined) {
        text += `:${link.column}`;
      }
    }
    return text;
  }

  /**
   * Create the popup element
   */
  private createPopup(): void {
    if (this.popup) {
      return;
    }

    const popup = document.createElement('div');
    popup.className = 'path-link-popup hidden';
    popup.innerHTML = `
      <div class="popup-header">
        <span class="popup-icon">📄</span>
        <span class="popup-path"></span>
      </div>
      <div class="popup-actions">
        <button data-action="preview">👁️ Preview</button>
        <button data-action="copy-content">📝 Copy Content</button>
        <button data-action="download">📥 Download</button>
        <button data-action="copy">📋 Copy Path</button>
        <button data-action="copy-full">📋 Copy Full Path</button>
      </div>
    `;

    // Add event listeners for actions
    popup.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const action = target.getAttribute('data-action');
      if (action && this.currentLink) {
        this.handleAction(action, this.currentLink);
        this.hidePopup();
      }
    });

    // Prevent popup from closing when hovering over it
    popup.addEventListener('mouseenter', () => {
      this.clearHideTimer();
    });

    popup.addEventListener('mouseleave', () => {
      this.scheduleHidePopup();
    });

    document.body.appendChild(popup);
    this.popup = popup;
  }

  /**
   * Show the popup at the specified position
   */
  private showPopup(link: PathLink, event: MouseEvent): void {
    if (!this.popup) {
      return;
    }

    this.currentLink = link;
    this.clearHideTimer();

    // Update popup content
    const pathEl = this.popup.querySelector('.popup-path');
    if (pathEl) {
      pathEl.textContent = this.formatLinkText(link);
    }

    // Position the popup near the click
    const x = event.clientX;
    const y = event.clientY;

    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Show temporarily to measure
    this.popup.style.visibility = 'hidden';
    this.popup.classList.remove('hidden');

    const popupRect = this.popup.getBoundingClientRect();
    const popupWidth = popupRect.width;
    const popupHeight = popupRect.height;

    // Calculate position (prefer below and to the right)
    let left = x + 10;
    let top = y + 10;

    // Adjust if it would go off the right edge
    if (left + popupWidth > viewportWidth - 10) {
      left = x - popupWidth - 10;
    }

    // Adjust if it would go off the bottom edge
    if (top + popupHeight > viewportHeight - 10) {
      top = y - popupHeight - 10;
    }

    // Ensure minimum bounds
    left = Math.max(10, left);
    top = Math.max(10, top);

    this.popup.style.left = `${left}px`;
    this.popup.style.top = `${top}px`;
    this.popup.style.visibility = 'visible';
  }

  /**
   * Hide the popup
   */
  private hidePopup(): void {
    if (this.popup) {
      this.popup.classList.add('hidden');
    }
    this.currentLink = null;
    this.clearHideTimer();
  }

  /**
   * Schedule hiding the popup after a delay
   */
  private scheduleHidePopup(): void {
    this.clearHideTimer();
    this.hidePopupTimer = window.setTimeout(() => {
      this.hidePopup();
    }, 200);
  }

  /**
   * Clear the hide timer
   */
  private clearHideTimer(): void {
    if (this.hidePopupTimer !== null) {
      window.clearTimeout(this.hidePopupTimer);
      this.hidePopupTimer = null;
    }
  }

  /**
   * Setup click-outside handler to close popup
   */
  private setupClickOutside(): void {
    const handler = (e: MouseEvent) => {
      if (this.popup && !this.popup.contains(e.target as Node)) {
        this.hidePopup();
      }
    };

    document.addEventListener('click', handler);
    this.disposables.push({
      dispose: () => document.removeEventListener('click', handler)
    });

    // Also close on Escape key
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.hidePopup();
      }
    };

    document.addEventListener('keydown', escHandler);
    this.disposables.push({
      dispose: () => document.removeEventListener('keydown', escHandler)
    });
  }

  /**
   * Handle popup action
   */
  private handleAction(action: string, link: PathLink): void {
    switch (action) {
      case 'preview':
        this.openPreview(link);
        break;
      case 'copy-content':
        this.copyFileContent(link);
        break;
      case 'download':
        this.downloadFile(link);
        break;
      case 'copy':
        this.copyPath(link, false);
        break;
      case 'copy-full':
        this.copyPath(link, true);
        break;
      default:
        // Unknown action - do nothing
        break;
    }
  }

  /**
   * Open file preview in a new tab
   */
  private openPreview(link: PathLink): void {
    const params = new URLSearchParams({
      session: this.sessionName,
      path: link.fullPath
    });

    if (link.line !== undefined) {
      params.set('line', String(link.line));
    }

    const url = `${this.basePath}/api/preview/file?${params.toString()}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  /**
   * Download the file
   */
  private downloadFile(link: PathLink): void {
    const params = new URLSearchParams({
      session: this.sessionName,
      path: link.fullPath
    });

    const url = `${this.basePath}/api/files/download?${params.toString()}`;

    // Create temporary link and trigger download
    const a = document.createElement('a');
    a.href = url;
    a.download = link.path.split('/').pop() || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /**
   * Copy file content to clipboard
   */
  private async copyFileContent(link: PathLink): Promise<void> {
    const params = new URLSearchParams({
      session: this.sessionName,
      path: link.fullPath
    });

    const url = `${this.basePath}/api/files/download?${params.toString()}`;

    try {
      this.showToast('Loading file...', 'info');

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const content = await response.text();

      await navigator.clipboard.writeText(content);

      const filename = link.path.split('/').pop() || 'file';
      const lines = content.split('\n').length;
      this.showToast(`Copied ${filename} (${lines} lines)`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.showToast(`Failed to copy: ${message}`, 'error');
    }
  }

  /**
   * Copy path to clipboard
   */
  private copyPath(link: PathLink, fullPath: boolean): void {
    const text = fullPath ? link.fullPath : link.path;
    navigator.clipboard.writeText(text).then(
      () => {
        this.showToast(`Copied: ${text}`);
      },
      () => {
        this.showToast('Failed to copy to clipboard', 'error');
      }
    );
  }

  /**
   * Show a toast notification
   */
  private showToast(message: string, type: 'success' | 'error' | 'info' = 'success'): void {
    // Check if toast container exists
    let container = document.getElementById('tui-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'tui-toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `tui-toast tui-toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    // Remove after delay
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 2000);
  }

  /**
   * Update the session CWD (called when session changes directory)
   */
  updateCwd(cwd: string): void {
    this.cwd = cwd;
  }

  /**
   * Show popup for a file path at specified coordinates.
   * Called from external components (e.g., ToolUse decoration).
   */
  showPopupForPath(filePath: string, x: number, y: number, line?: number, column?: number): void {
    const pathLink: PathLink = {
      path: filePath.split('/').pop() || filePath,
      fullPath: filePath.startsWith('/') ? filePath : this.resolveFullPath(filePath),
      line,
      column,
      range: { start: 0, end: 0 }
    };

    this.currentLink = pathLink;
    this.clearHideTimer();

    // Ensure popup is created
    if (!this.popup) {
      this.createPopup();
    }

    // Update popup content
    const pathEl = this.popup?.querySelector('.popup-path');
    if (pathEl) {
      pathEl.textContent = this.formatLinkText(pathLink);
    }

    // Position popup
    this.positionPopup(x, y);
  }

  /**
   * Position popup at specified coordinates
   */
  private positionPopup(x: number, y: number): void {
    if (!this.popup) return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    this.popup.style.visibility = 'hidden';
    this.popup.classList.remove('hidden');

    const popupRect = this.popup.getBoundingClientRect();

    let left = x + 10;
    let top = y + 10;

    if (left + popupRect.width > viewportWidth - 10) {
      left = x - popupRect.width - 10;
    }
    if (top + popupRect.height > viewportHeight - 10) {
      top = y - popupRect.height - 10;
    }

    this.popup.style.left = `${Math.max(10, left)}px`;
    this.popup.style.top = `${Math.max(10, top)}px`;
    this.popup.style.visibility = 'visible';
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.clearHideTimer();

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];

    if (this.popup) {
      this.popup.remove();
      this.popup = null;
    }

    this.currentLink = null;
  }
}
