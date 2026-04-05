/**
 * Preview Manager
 *
 * Manages HTML preview functionality including file selection,
 * live reload, and pane visibility.
 */

import type { Mountable, Scope } from '@/browser/shared/lifecycle.js';
import type { TerminalUiConfig } from '@/browser/shared/types.js';
import {
  bindClickScoped,
  getSessionNameFromURL,
  isPreviewable as isPreviewableUtil
} from '@/browser/shared/utils.js';
import type {
  FileChangeEvent,
  FileWatcherClient
} from '@/features/file-watcher/client/FileWatcherClient.js';
import type { PreviewError, PreviewPane, PreviewPaneElements } from './PreviewPane.js';

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

export class PreviewManager implements Mountable {
  private config: TerminalUiConfig;
  private pane: PreviewPane;
  private watcher: FileWatcherClient;
  private currentFile: CurrentFile | null = null;
  private sessionName: string;
  private elements: {
    previewBtn: HTMLButtonElement;
    paneElements: PreviewPaneElements;
  } | null = null;

  constructor(config: TerminalUiConfig, deps: PreviewManagerDeps) {
    this.config = config;
    this.pane = deps.pane;
    this.watcher = deps.watcher;
    // Use sessionName from config if available (server-provided), otherwise extract from URL
    this.sessionName = config.sessionName || getSessionNameFromURL(config.base_path);

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
   * Bind DOM elements (stores reference only)
   */
  bindElements(previewBtn: HTMLButtonElement, paneElements: PreviewPaneElements): void {
    this.elements = { previewBtn, paneElements };
    this.pane.bindElements(paneElements);
  }

  /**
   * Mount event listeners to scope for automatic cleanup
   */
  mount(scope: Scope): void {
    const { elements } = this;
    if (!elements) {
      return;
    }

    const { previewBtn, paneElements } = elements;

    // Preview button toggles pane
    bindClickScoped(scope, previewBtn, () => this.toggle());

    // Pane close button
    bindClickScoped(scope, paneElements.closeBtn, () => this.close());

    // Pane refresh button
    bindClickScoped(scope, paneElements.refreshBtn, () => this.refresh());

    // Pane select button - opens file browser
    bindClickScoped(scope, paneElements.selectBtn, () => this.openFileSelector());

    // Note: Escape key handling is now centralized in KeyRouter
  }

  /**
   * Toggle preview pane visibility
   */
  toggle(): void {
    if (this.pane.isVisible) {
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
    console.log('[PreviewManager] Loading preview:', { session, path, url });
    this.pane.loadUrl(url);
    this.pane.setTitle(this.getFileName(path));

    // Show pane if hidden
    if (!this.pane.isVisible) {
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
    if (!this.pane.isVisible) {
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
    console.log('[PreviewManager] Opening file selector, sessionName:', this.sessionName);
    const event = new CustomEvent('tui-preview-select', {
      detail: {
        callback: (selection: { path: string; isDirectory: boolean }) => {
          console.log('[PreviewManager] File selected:', selection);
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
   * Check if a file is previewable
   */
  isPreviewable(filename: string): boolean {
    return isPreviewableUtil(filename, this.config.preview_allowed_extensions);
  }

  /**
   * Get current file
   */
  get currentFileValue(): CurrentFile | null {
    return this.currentFile;
  }

  /**
   * Check if pane is visible
   */
  get isVisible(): boolean {
    return this.pane.isVisible;
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
    if (this.pane.isVisible) {
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
