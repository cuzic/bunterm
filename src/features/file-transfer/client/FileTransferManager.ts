/**
 * File Transfer Manager
 *
 * Manages file upload/download operations from the toolbar.
 * Uses the file transfer API endpoints for secure file operations.
 */

import { BaseModal } from '@/browser/shared/BaseModal.js';
import { on, type Scope } from '@/browser/shared/lifecycle.js';
import type { TerminalUiConfig } from '@/browser/shared/types.js';
import {
  bindClickScoped,
  formatFileSize,
  formatRelativeTime,
  getSessionNameFromURL,
  isPreviewable as isPreviewableUtil
} from '@/browser/shared/utils.js';
import type { InputHandler } from '@/browser/toolbar/InputHandler.js';

export interface FileInfo {
  name: string;
  size: number;
  isDirectory: boolean;
  modifiedAt: string;
  /** For directories in preview mode: true if index.html exists recursively */
  hasIndexHtml?: boolean;
}

/** Recent file info from API */
export interface RecentFileInfo {
  path: string;
  name: string;
  modifiedAt: string;
  size: number;
}

export interface FileTransferElements {
  downloadBtn: HTMLButtonElement;
  uploadBtn: HTMLButtonElement;
  modal: HTMLElement;
  modalClose: HTMLButtonElement;
  modalTitle: HTMLElement;
  fileList: HTMLElement;
  breadcrumb: HTMLElement;
  uploadInput: HTMLInputElement;
  uploadBtn2: HTMLButtonElement;
}

/** Callback for preview selection */
export interface PreviewSelection {
  path: string;
  isDirectory: boolean;
}

export class FileTransferManager extends BaseModal {
  private config: TerminalUiConfig;
  private inputHandler: InputHandler | null = null;
  private elements: FileTransferElements | null = null;
  private currentPath = '.';
  private sessionName = '';
  private previewMode = false;
  private previewCallback: ((selection: PreviewSelection) => void) | null = null;

  constructor(config: TerminalUiConfig, inputHandler?: InputHandler) {
    super({ backdropClose: true });
    this.config = config;
    this.inputHandler = inputHandler ?? null;
    // Use sessionName from config if available (server-provided), otherwise extract from URL
    this.sessionName = config.sessionName || getSessionNameFromURL(config.base_path);
  }

  /**
   * Bind modal elements (stores reference only)
   */
  bindElements(
    downloadBtn: HTMLButtonElement,
    uploadBtn: HTMLButtonElement,
    modal: HTMLElement,
    modalClose: HTMLButtonElement,
    modalTitle: HTMLElement,
    fileList: HTMLElement,
    breadcrumb: HTMLElement,
    uploadInput: HTMLInputElement,
    uploadBtn2: HTMLButtonElement
  ): void {
    this.elements = {
      downloadBtn,
      uploadBtn,
      modal,
      modalClose,
      modalTitle,
      fileList,
      breadcrumb,
      uploadInput,
      uploadBtn2
    };

    // Bind modal to base class
    this.bindModal(modal, modalClose);
  }

  /**
   * Additional mount logic for FileTransferManager
   */
  protected onMount(scope: Scope): void {
    const { elements } = this;
    if (!elements) {
      return;
    }

    // Download button - opens file browser modal
    bindClickScoped(scope, elements.downloadBtn, () => this.showDownloadMode());

    // Upload button - triggers file selection
    // Note: Don't use bindClickScoped here because it calls preventDefault()
    // which breaks the trusted user gesture chain on mobile browsers
    scope.add(
      on(elements.uploadBtn, 'click', () => {
        elements.uploadInput.click();
      })
    );

    // Upload input change
    scope.add(
      on(elements.uploadInput, 'change', async () => {
        const files = elements.uploadInput.files;
        if (files && files.length > 0) {
          await this.uploadFiles(files);
          elements.uploadInput.value = '';
        }
      })
    );

    // Modal upload button
    // Note: Don't use bindClickScoped here because it calls preventDefault()
    // which breaks the trusted user gesture chain on mobile browsers
    scope.add(
      on(elements.uploadBtn2, 'click', () => {
        elements.uploadInput.click();
      })
    );

    // Note: Escape key handling is now centralized in KeyRouter
  }

  /**
   * Clear recent files and reset state when hiding
   */
  protected onHide(): void {
    this.clearRecentFiles();
  }

  /**
   * Show download mode (file browser)
   */
  async showDownloadMode(): Promise<void> {
    if (!this.elements) {
      return;
    }

    this.previewMode = false;
    this.previewCallback = null;
    this.elements.modalTitle.textContent = 'ファイルブラウザ';
    this.currentPath = '.';
    this.show();
    await this.loadFileList();
  }

  /**
   * Open file browser for preview file selection
   */
  async openForPreview(callback: (selection: PreviewSelection) => void): Promise<void> {
    if (!this.elements) {
      return;
    }

    this.previewMode = true;
    this.previewCallback = callback;
    this.elements.modalTitle.textContent = 'プレビューするファイルまたはフォルダを選択';
    this.currentPath = '.';
    this.show();

    // Load recent files and file list in parallel
    await Promise.all([this.loadRecentFiles(), this.loadFileList()]);
  }

  /**
   * Load recent files from API
   */
  private async loadRecentFiles(): Promise<void> {
    if (!this.elements || !this.previewMode) {
      return;
    }

    // Build extensions parameter from config
    const extensions = this.config.preview_allowed_extensions?.join(',') || '.html,.htm,.md,.txt';
    const url = `${this.config.base_path}/api/files/recent?session=${encodeURIComponent(this.sessionName)}&extensions=${encodeURIComponent(extensions)}&count=5`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as { files: RecentFileInfo[] };
      this.renderRecentFiles(data.files);
    } catch {
      // Silently fail - recent files section is optional
    }
  }

  /**
   * Render recent files section
   */
  private renderRecentFiles(files: RecentFileInfo[]): void {
    if (!this.elements || files.length === 0) {
      return;
    }

    const { fileList } = this.elements;

    // Remove existing recent files section if present
    const existingSection = fileList.parentElement?.querySelector('.tui-recent-files');
    if (existingSection) {
      existingSection.remove();
    }

    // Create recent files section
    const section = document.createElement('div');
    section.className = 'tui-recent-files';

    const header = document.createElement('div');
    header.className = 'tui-recent-header';
    header.textContent = '\uD83D\uDCCC 最近更新されたファイル:';
    section.appendChild(header);

    for (const file of files) {
      const item = this.createRecentFileItem(file);
      section.appendChild(item);
    }

    // Insert before file list
    fileList.parentElement?.insertBefore(section, fileList);
  }

  /**
   * Create a recent file item element
   */
  private createRecentFileItem(file: RecentFileInfo): HTMLElement {
    const item = document.createElement('div');
    item.className = 'tui-recent-item';

    const left = document.createElement('div');
    left.className = 'tui-recent-left';

    const icon = document.createElement('span');
    icon.className = 'tui-recent-icon';
    icon.textContent = '\uD83D\uDCC4'; // 📄

    const name = document.createElement('span');
    name.className = 'tui-recent-name';
    name.textContent = file.path;
    name.title = file.path;

    left.appendChild(icon);
    left.appendChild(name);

    const time = document.createElement('span');
    time.className = 'tui-recent-time';
    time.textContent = formatRelativeTime(file.modifiedAt);

    item.appendChild(left);
    item.appendChild(time);

    // Click handler - select file for preview
    // biome-ignore lint: cleaned up via cleanupFns
    item.addEventListener('click', () => {
      if (this.previewCallback) {
        this.previewCallback({ path: file.path, isDirectory: false });
      }
      this.hide();
      this.previewMode = false;
      this.previewCallback = null;
    });

    return item;
  }

  /**
   * Clear recent files section
   */
  private clearRecentFiles(): void {
    if (!this.elements) {
      return;
    }
    const existingSection =
      this.elements.fileList.parentElement?.querySelector('.tui-recent-files');
    if (existingSection) {
      existingSection.remove();
    }
  }

  /**
   * Load and display file list
   */
  private async loadFileList(): Promise<void> {
    if (!this.elements) {
      return;
    }

    const { fileList } = this.elements;

    // Show loading
    fileList.textContent = '';
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'tui-file-loading';
    loadingDiv.textContent = '読み込み中...';
    fileList.appendChild(loadingDiv);

    try {
      const previewParam = this.previewMode ? '&preview=true' : '';
      const response = await fetch(
        `${this.config.base_path}/api/files/list?session=${encodeURIComponent(this.sessionName)}&path=${encodeURIComponent(this.currentPath)}${previewParam}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to load file list');
      }

      const data = (await response.json()) as { files: FileInfo[] };
      this.renderFileList(data.files);
      this.renderBreadcrumb();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      fileList.textContent = '';
      const errorDiv = document.createElement('div');
      errorDiv.className = 'tui-file-error';
      errorDiv.textContent = `エラー: ${errorMessage}`;
      fileList.appendChild(errorDiv);
    }
  }

  /**
   * Render file list
   */
  private renderFileList(files: FileInfo[]): void {
    if (!this.elements) {
      return;
    }

    const { fileList } = this.elements;
    fileList.innerHTML = '';

    // Filter files in preview mode
    // - Show HTML files
    // - Show directories only if they contain index.html recursively
    let filteredFiles = files;
    if (this.previewMode) {
      filteredFiles = files.filter((f) => {
        // HTML files are always shown
        if (this.isPreviewable(f.name)) {
          return true;
        }
        // Directories are only shown if they contain index.html
        if (f.isDirectory) {
          return f.hasIndexHtml === true;
        }
        return false;
      });
    }

    // Sort: directories first, then by name
    const sorted = [...filteredFiles].sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    // Add parent directory link if not at root
    if (this.currentPath !== '.') {
      const parentItem = this.createFileItem({
        name: '..',
        size: 0,
        isDirectory: true,
        modifiedAt: ''
      });
      fileList.appendChild(parentItem);
    }

    if (sorted.length === 0) {
      const message = this.previewMode ? 'HTMLファイルがありません' : 'ファイルがありません';
      fileList.textContent = '';
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'tui-file-empty';
      emptyDiv.textContent = message;
      fileList.appendChild(emptyDiv);
      return;
    }

    for (const file of sorted) {
      const item = this.createFileItem(file);
      fileList.appendChild(item);
    }
  }

  /**
   * Create a file item element
   */
  private createFileItem(file: FileInfo): HTMLElement {
    const item = document.createElement('div');
    item.className = 'tui-file-item';
    if (file.isDirectory) {
      item.classList.add('directory');
    }

    const icon = document.createElement('span');
    icon.className = 'tui-file-icon';
    icon.textContent = file.isDirectory ? '\uD83D\uDCC1' : '\uD83D\uDCC4'; // 📁 : 📄

    const name = document.createElement('span');
    name.className = 'tui-file-name';
    name.textContent = file.name;

    const size = document.createElement('span');
    size.className = 'tui-file-size';
    size.textContent = file.isDirectory ? '' : formatFileSize(file.size);

    item.appendChild(icon);
    item.appendChild(name);
    item.appendChild(size);

    // Add SPA preview button for directories in preview mode (except "..")
    if (this.previewMode && file.isDirectory && file.name !== '..') {
      const spaBtn = document.createElement('button');
      spaBtn.className = 'tui-file-spa-btn';
      spaBtn.textContent = '👁';
      spaBtn.title = 'SPAとしてプレビュー';
      // biome-ignore lint: cleaned up via cleanupFns
      spaBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const fullPath = this.currentPath === '.' ? file.name : `${this.currentPath}/${file.name}`;
        if (this.previewCallback) {
          this.previewCallback({ path: fullPath, isDirectory: true });
        }
        this.hide();
        this.previewMode = false;
        this.previewCallback = null;
      });
      item.appendChild(spaBtn);
    }

    // Click handler
    // biome-ignore lint: cleaned up via cleanupFns
    item.addEventListener('click', () => {
      if (file.isDirectory) {
        this.navigateTo(file.name);
      } else if (this.previewMode) {
        // In preview mode, select the file for preview
        const fullPath = this.currentPath === '.' ? file.name : `${this.currentPath}/${file.name}`;
        if (this.previewCallback) {
          this.previewCallback({ path: fullPath, isDirectory: false });
        }
        this.hide();
        this.previewMode = false;
        this.previewCallback = null;
      } else {
        this.downloadFile(file.name);
      }
    });

    return item;
  }

  /**
   * Check if file is previewable (based on server config)
   */
  private isPreviewable(filename: string): boolean {
    return isPreviewableUtil(filename, this.config.preview_allowed_extensions);
  }

  /**
   * Navigate to a directory
   */
  private async navigateTo(dirName: string): Promise<void> {
    if (dirName === '..') {
      // Go to parent directory
      const parts = this.currentPath.split('/');
      parts.pop();
      this.currentPath = parts.length > 0 ? parts.join('/') : '.';
    } else {
      // Go to child directory
      this.currentPath = this.currentPath === '.' ? dirName : `${this.currentPath}/${dirName}`;
    }

    // Clear recent files when navigating away from root
    if (this.currentPath !== '.') {
      this.clearRecentFiles();
    }

    await this.loadFileList();

    // Show recent files again when returning to root in preview mode
    if (this.currentPath === '.' && this.previewMode) {
      await this.loadRecentFiles();
    }
  }

  /**
   * Render breadcrumb navigation
   */
  private renderBreadcrumb(): void {
    if (!this.elements) {
      return;
    }

    const { breadcrumb } = this.elements;
    breadcrumb.innerHTML = '';

    // Root
    const root = document.createElement('span');
    root.className = 'bunterm-breadcrumb-item';
    root.textContent = '\uD83C\uDFE0'; // 🏠
    // biome-ignore lint: cleaned up via cleanupFns
    root.addEventListener('click', async () => {
      this.currentPath = '.';
      await this.loadFileList();
    });
    breadcrumb.appendChild(root);

    if (this.currentPath === '.') {
      return;
    }

    // Path parts
    const parts = this.currentPath.split('/');
    let path = '';
    for (const part of parts) {
      const separator = document.createElement('span');
      separator.className = 'bunterm-breadcrumb-separator';
      separator.textContent = ' / ';
      breadcrumb.appendChild(separator);

      path = path ? `${path}/${part}` : part;
      const item = document.createElement('span');
      item.className = 'bunterm-breadcrumb-item';
      item.textContent = part;
      const currentPath = path;
      // biome-ignore lint: cleaned up via cleanupFns
      item.addEventListener('click', async () => {
        this.currentPath = currentPath;
        await this.loadFileList();
      });
      breadcrumb.appendChild(item);
    }
  }

  /**
   * Download a file
   */
  private async downloadFile(fileName: string): Promise<void> {
    const path = this.currentPath === '.' ? fileName : `${this.currentPath}/${fileName}`;
    const url = `${this.config.base_path}/api/files/download?session=${encodeURIComponent(this.sessionName)}&path=${encodeURIComponent(path)}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Download failed');
      }

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      alert(
        `ダウンロードに失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Upload files and send their paths to terminal
   */
  private async uploadFiles(files: FileList): Promise<void> {
    const uploadedPaths: string[] = [];

    for (const file of files) {
      const path = await this.uploadFile(file);
      if (path) {
        uploadedPaths.push(path);
      }
    }

    // Send uploaded file paths to terminal
    if (uploadedPaths.length > 0 && this.inputHandler) {
      // Join paths with space for multiple files
      const pathText = uploadedPaths.join(' ');
      this.inputHandler.sendText(pathText);
    }

    // Refresh file list if modal is open
    if (this.isVisible()) {
      await this.loadFileList();
    }
  }

  /**
   * Upload a single file
   * Returns the uploaded file path, or null on failure
   */
  private async uploadFile(file: File): Promise<string | null> {
    const path = this.currentPath === '.' ? '' : this.currentPath;
    const url = `${this.config.base_path}/api/files/upload?session=${encodeURIComponent(this.sessionName)}&path=${encodeURIComponent(path)}`;

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(url, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      // Parse response to get the uploaded file path
      const result = (await response.json()) as { success: boolean; path: string };
      return result.path;
    } catch (error) {
      alert(
        `アップロードに失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return null;
    }
  }
}
