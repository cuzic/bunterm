/**
 * Preview Manager
 *
 * Manages HTML preview functionality including file selection,
 * live reload, and pane visibility.
 */

import type { FileChangeEvent, FileWatcherClient } from './FileWatcherClient.js';
import type { PreviewError, PreviewPane, PreviewPaneElements } from './PreviewPane.js';
import type { TerminalUiConfig } from './types.js';
import { getSessionNameFromURL, isPreviewable as isPreviewableUtil } from './utils.js';

export type PreviewErrorHandler = (error: PreviewError) => void;

/** Currently previewing file or directory */
interface CurrentFile {
  session: string;
  path: string;
  isDirectory?: boolean;
}

export interface PreviewManagerDeps {
  pane: PreviewPane;
  watcher: FileWatcherClient;
}

export class PreviewManager {
  private config: TerminalUiConfig;
  private pane: PreviewPane;
  private watcher: FileWatcherClient;
  private currentFile: CurrentFile | null = null;
  private sessionName: string;
  private elements: {
    previewBtn: HTMLButtonElement;
    paneElements: PreviewPaneElements;
  } | null = null;
  private fileSelectCallback: ((path: string) => void) | null = null;

  constructor(config: TerminalUiConfig, deps: PreviewManagerDeps) {
    this.config = config;
    this.pane = deps.pane;
    this.watcher = deps.watcher;
    this.sessionName = getSessionNameFromURL(config.base_path);

    // Listen for file changes
    this.watcher.onFileChange((event) => this.onFileChange(event));
  }

  /**
   * Set error handler for preview errors
   * @param handler Callback to handle errors from the preview iframe
   */
  setErrorHandler(handler: PreviewErrorHandler): void {
    this.pane.setOnError(handler);
    this.pane.setOnConsoleError((message) => {
      handler({ type: 'error', message });
    });
  }

  /**
   * Bind DOM elements and setup event listeners
   */
  bindElements(previewBtn: HTMLButtonElement, paneElements: PreviewPaneElements): void {
    this.elements = { previewBtn, paneElements };
    this.pane.bindElements(paneElements);

    // Preview button toggles pane
    previewBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.toggle();
    });

    // Pane close button
    paneElements.closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.close();
    });

    // Pane refresh button
    paneElements.refreshBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.refresh();
    });

    // Pane select button - opens file browser
    paneElements.selectBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.openFileSelector();
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.pane.isVisible()) {
        this.close();
      }
    });
  }

  /**
   * Toggle preview pane visibility
   */
  toggle(): void {
    if (this.pane.isVisible()) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Open preview pane (shows file selector if no file selected)
   */
  open(): void {
    this.pane.show();
    this.updateButtonState();

    if (!this.currentFile) {
      this.openFileSelector();
    }
  }

  /**
   * Close preview pane
   */
  close(): void {
    if (this.currentFile) {
      if (this.currentFile.isDirectory) {
        this.watcher.unwatchDir(this.currentFile.session, this.currentFile.path);
      } else {
        this.watcher.unwatch(this.currentFile.session, this.currentFile.path);
      }
      this.currentFile = null;
    }

    this.pane.hide();
    this.updateButtonState();
  }

  /**
   * Preview a specific file
   */
  previewFile(session: string, path: string): void {
    // Unwatch previous file or directory
    if (this.currentFile) {
      if (this.currentFile.isDirectory) {
        this.watcher.unwatchDir(this.currentFile.session, this.currentFile.path);
      } else {
        this.watcher.unwatch(this.currentFile.session, this.currentFile.path);
      }
    }

    // Set new file
    this.currentFile = { session, path, isDirectory: false };

    // Watch for changes
    this.watcher.watch(session, path);

    // Load in iframe
    const url = `${this.config.base_path}/api/preview/file?session=${encodeURIComponent(session)}&path=${encodeURIComponent(path)}`;
    this.pane.loadUrl(url);
    this.pane.setTitle(this.getFileName(path));

    // Show pane if hidden
    if (!this.pane.isVisible()) {
      this.pane.show();
      this.updateButtonState();
    }
  }

  /**
   * Preview a directory as SPA (uses static serving endpoint)
   * @param session Session name
   * @param dirPath Directory path relative to session dir (e.g., "dist" or "build")
   */
  previewDirectory(session: string, dirPath: string): void {
    // Unwatch previous file or directory
    if (this.currentFile) {
      if (this.currentFile.isDirectory) {
        this.watcher.unwatchDir(this.currentFile.session, this.currentFile.path);
      } else {
        this.watcher.unwatch(this.currentFile.session, this.currentFile.path);
      }
    }

    // Set current to directory
    this.currentFile = { session, path: dirPath, isDirectory: true };

    // Watch the entire directory recursively
    this.watcher.watchDir(session, dirPath);

    // Use static serving endpoint for SPA support
    // Normalize path: ensure no leading/trailing slashes
    const normalizedPath = dirPath.replace(/^\/+|\/+$/g, '');
    const url = `${this.config.base_path}/api/preview/static/${encodeURIComponent(session)}/${normalizedPath}/`;
    this.pane.loadUrl(url);
    this.pane.setTitle(normalizedPath || 'Preview');

    // Show pane if hidden
    if (!this.pane.isVisible()) {
      this.pane.show();
      this.updateButtonState();
    }
  }

  /**
   * Check if a path looks like an SPA directory
   */
  isSpaDirectory(path: string): boolean {
    const lowerPath = path.toLowerCase();
    // Common SPA build output directories
    return (
      lowerPath === 'dist' ||
      lowerPath === 'build' ||
      lowerPath === 'out' ||
      lowerPath === 'public' ||
      lowerPath.endsWith('/dist') ||
      lowerPath.endsWith('/build') ||
      lowerPath.endsWith('/out')
    );
  }

  /**
   * Refresh current preview
   */
  refresh(): void {
    if (this.currentFile) {
      this.pane.reload();
    }
  }

  /**
   * Open file selector
   * Uses the existing FileTransferManager file browser
   */
  openFileSelector(): void {
    // Trigger the file modal in "preview select" mode
    // This is handled by FileTransferManager integration
    const event = new CustomEvent('tui-preview-select', {
      detail: {
        callback: (selection: { path: string; isDirectory: boolean }) => {
          if (selection.isDirectory) {
            this.previewDirectory(this.sessionName, selection.path);
          } else {
            this.previewFile(this.sessionName, selection.path);
          }
        }
      }
    });
    document.dispatchEvent(event);
  }

  /**
   * Set callback for file selection
   * Called by FileTransferManager when in preview select mode
   */
  setFileSelectCallback(callback: ((path: string) => void) | null): void {
    this.fileSelectCallback = callback;
  }

  /**
   * Get file select callback
   */
  getFileSelectCallback(): ((path: string) => void) | null {
    return this.fileSelectCallback;
  }

  /**
   * Check if a file is previewable
   */
  isPreviewable(filename: string): boolean {
    return isPreviewableUtil(filename, this.config.preview_allowed_extensions);
  }

  /**
   * Get current file
   */
  getCurrentFile(): CurrentFile | null {
    return this.currentFile;
  }

  /**
   * Check if pane is visible
   */
  isVisible(): boolean {
    return this.pane.isVisible();
  }

  /**
   * Handle file change event
   */
  private onFileChange(event: FileChangeEvent): void {
    if (!this.currentFile) {
      return;
    }

    // Check session matches
    if (event.session !== this.currentFile.session) {
      return;
    }

    if (this.currentFile.isDirectory) {
      // Directory watching: reload if changed file is within the watched directory
      const dirPath = this.currentFile.path;
      if (event.path.startsWith(`${dirPath}/`) || event.path === dirPath || dirPath === '') {
        this.pane.reload();
      }
    } else if (event.path === this.currentFile.path) {
      // File watching: exact match
      this.pane.reload();
    }
  }

  /**
   * Update preview button state
   */
  private updateButtonState(): void {
    if (!this.elements) {
      return;
    }

    const { previewBtn } = this.elements;
    if (this.pane.isVisible()) {
      previewBtn.classList.add('active');
    } else {
      previewBtn.classList.remove('active');
    }
  }

  /**
   * Extract filename from path
   */
  private getFileName(path: string): string {
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
  }
}
