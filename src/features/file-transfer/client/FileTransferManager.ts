/**
 * File Transfer Manager
 *
 * Manages file upload/download operations from the toolbar.
 * Uses the file transfer API endpoints for secure file operations.
 */

import { type Mountable, type Scope, on } from '@/browser/shared/lifecycle.js';
import type { TerminalUiConfig } from '@/browser/shared/types.js';
import {
  bindClickScoped,
  getSessionNameFromURL,
  isPreviewable as isPreviewableUtil
} from '@/browser/shared/utils.js';

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

export class FileTransferManager implements Mountable {
  private config: TerminalUiConfig;
  private elements: FileTransferElements | null = null;
  private currentPath = '.';
  private sessionName = '';
  private previewMode = false;
  private previewCallback: ((selection: PreviewSelection) => void) | null = null;

  constructor(config: TerminalUiConfig) {
    this.config = config;
    this.sessionName = getSessionNameFromURL(config.base_path);
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
  }

  /**
   * Mount event listeners to scope for automatic cleanup
   */
  mount(scope: Scope): void {
    const { elements } = this;
    if (!elements) {
      return;
    }

    // Download button - opens file browser modal
    bindClickScoped(scope, elements.downloadBtn, () => this.showDownloadMode());

    // Upload button - triggers file selection
    bindClickScoped(scope, elements.uploadBtn, () => elements.uploadInput.click());

    // Close modal
    bindClickScoped(scope, elements.modalClose, () => this.hide());

    // Close on backdrop click
    scope.add(
      on(elements.modal, 'click', (e: Event) => {
        if (e.target === elements.modal) {
          this.hide();
        }
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
    bindClickScoped(scope, elements.uploadBtn2, () => elements.uploadInput.click());

    // Note: Escape key handling is now centralized in KeyRouter
  }

  /**
   * Check if modal is visible
   */
  isVisible(): boolean {
    return this.elements?.modal ? !this.elements.modal.classList.contains('hidden') : false;
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
    this.elements.modal.classList.remove('hidden');
    this.currentPath = '.';
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
    this.elements.modal.classList.remove('hidden');
    this.currentPath = '.';

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
    time.textContent = this.formatRelativeTime(file.modifiedAt);

    item.appendChild(left);
    item.appendChild(time);

    // Click handler - select file for preview
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
   * Format relative time (e.g., "2分前", "1時間前")
   */
  private formatRelativeTime(isoString: string): string {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) {
      return 'たった今';
    }
    if (diffMin < 60) {
      return `${diffMin}分前`;
    }
    if (diffHour < 24) {
      return `${diffHour}時間前`;
    }
    if (diffDay < 7) {
      return `${diffDay}日前`;
    }
    // Show date for older files
    return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
  }

  /**
   * Hide the modal
   */
  hide(): void {
    if (!this.elements) {
      return;
    }
    this.elements.modal.classList.add('hidden');
    this.clearRecentFiles();
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
    fileList.innerHTML = '<div class="tui-file-loading">読み込み中...</div>';

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
      fileList.innerHTML = `<div class="tui-file-error">エラー: ${error instanceof Error ? error.message : 'Unknown error'}</div>`;
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
      fileList.innerHTML = `<div class="tui-file-empty">${message}</div>`;
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
    size.textContent = file.isDirectory ? '' : this.formatSize(file.size);

    item.appendChild(icon);
    item.appendChild(name);
    item.appendChild(size);

    // Add SPA preview button for directories in preview mode (except "..")
    if (this.previewMode && file.isDirectory && file.name !== '..') {
      const spaBtn = document.createElement('button');
      spaBtn.className = 'tui-file-spa-btn';
      spaBtn.textContent = '👁';
      spaBtn.title = 'SPAとしてプレビュー';
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
   * Upload files
   */
  private async uploadFiles(files: FileList): Promise<void> {
    for (const file of files) {
      await this.uploadFile(file);
    }
    // Refresh file list if modal is open
    if (this.isVisible()) {
      await this.loadFileList();
    }
  }

  /**
   * Upload a single file
   */
  private async uploadFile(file: File): Promise<void> {
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
    } catch (error) {
      alert(
        `アップロードに失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Format file size for display
   */
  private formatSize(bytes: number): string {
    if (bytes === 0) {
      return '0 B';
    }
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const size = bytes / 1024 ** i;
    return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }
}
