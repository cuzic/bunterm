/**
 * Smart Paste Manager
 *
 * Handles smart clipboard operations that detect content type
 * (text/image/file) and process accordingly.
 * - Text: send directly to terminal
 * - Image: show preview modal, upload to server, send path to terminal
 * - File: upload to server, send path to terminal
 *
 * State management is handled by XState state machine.
 */

import { type Actor, createActor } from 'xstate';
import type { ClipboardHistoryManager } from './ClipboardHistoryManager.js';
import type { InputHandler } from './InputHandler.js';
import {
  type PendingUpload,
  type SmartPasteContext,
  type SmartPasteEvent,
  smartPasteMachine
} from './smartPasteMachine.js';
import type { SmartPasteElements, TerminalUiConfig } from './types.js';
import { blobToBase64, getSessionNameFromURL } from './utils.js';

// Re-export PendingUpload from state machine
export type { PendingUpload } from './smartPasteMachine.js';

type SmartPasteActor = Actor<typeof smartPasteMachine>;

export class SmartPasteManager {
  private config: TerminalUiConfig;
  private inputHandler: InputHandler;
  private historyManager: ClipboardHistoryManager;
  private elements: SmartPasteElements | null = null;
  private actor: SmartPasteActor;
  private unsubscribe: (() => void) | null = null;
  private inputTextarea: HTMLTextAreaElement | null = null;

  constructor(
    config: TerminalUiConfig,
    inputHandler: InputHandler,
    historyManager: ClipboardHistoryManager
  ) {
    this.config = config;
    this.inputHandler = inputHandler;
    this.historyManager = historyManager;

    // Create and start the state machine actor
    this.actor = createActor(smartPasteMachine);
    this.actor.start();

    // Subscribe to state changes
    this.unsubscribe = this.actor.subscribe((snapshot) => {
      this.onStateChange(snapshot);
    });
  }

  /**
   * Handle state changes from the state machine
   */
  private onStateChange(snapshot: ReturnType<SmartPasteActor['getSnapshot']>): void {
    const state = snapshot.value;
    const context = snapshot.context;

    // Update UI based on state
    switch (state) {
      case 'idle': {
        this.hidePreviewModal();
        // Handle uploaded paths
        if (context.uploadedPaths.length > 0) {
          const pathText = context.uploadedPaths.join(' ');
          this.inputHandler.sendText(pathText);
        }
        break;
      }

      case 'previewing': {
        this.showPreviewModal();
        this.renderPreview(context);
        // Show error if any
        if (context.error) {
          alert(`アップロードに失敗しました: ${context.error}`);
        }
        break;
      }

      case 'uploading':
        this.showUploadingState();
        break;
    }
  }

  /**
   * Send event to the state machine
   */
  private send(event: SmartPasteEvent): void {
    this.actor.send(event);
  }

  /**
   * Get current state snapshot
   */
  private getContext(): SmartPasteContext {
    return this.actor.getSnapshot().context;
  }

  /**
   * Get current state value
   */
  private getState(): string {
    return this.actor.getSnapshot().value as string;
  }

  /**
   * Bind DOM elements for preview modal and drop zone
   */
  bindElements(elements: SmartPasteElements): void {
    this.elements = elements;
    this.setupEventListeners();
    this.setupDropZone();
  }

  /**
   * Bind input textarea for text paste
   */
  bindInputTextarea(textarea: HTMLTextAreaElement): void {
    this.inputTextarea = textarea;
  }

  /**
   * Setup event listeners for modal controls
   */
  private setupEventListeners(): void {
    if (!this.elements) {
      return;
    }

    // Close button
    this.elements.previewClose.addEventListener('click', () => {
      this.send({ type: 'CANCEL' });
    });

    // Cancel button
    this.elements.previewCancel.addEventListener('click', () => {
      this.send({ type: 'CANCEL' });
    });

    // Submit button
    this.elements.previewSubmit.addEventListener('click', () => {
      this.handleSubmit();
    });

    // Navigation buttons
    this.elements.previewPrev.addEventListener('click', () => {
      this.send({ type: 'PREV' });
    });

    this.elements.previewNext.addEventListener('click', () => {
      this.send({ type: 'NEXT' });
    });

    // Remove current item button
    this.elements.previewRemove.addEventListener('click', () => {
      this.send({ type: 'REMOVE' });
    });

    // Close on backdrop click
    this.elements.previewModal.addEventListener('click', (e) => {
      if (e.target === this.elements?.previewModal) {
        this.send({ type: 'CANCEL' });
      }
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (!this.isPreviewVisible()) {
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        this.send({ type: 'CANCEL' });
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.send({ type: 'PREV' });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.send({ type: 'NEXT' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.handleSubmit();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        this.send({ type: 'REMOVE' });
      }
    });

    // Setup dot click handler (event delegation)
    this.setupDotClickHandler();
  }

  /**
   * Setup drag and drop zone
   */
  private setupDropZone(): void {
    // Prevent default drag behaviors on document
    document.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    document.addEventListener('drop', (e) => {
      e.preventDefault();
      this.hideDropZone();
    });

    // Show drop zone when dragging files
    document.addEventListener('dragenter', (e) => {
      if (this.hasFiles(e.dataTransfer)) {
        this.showDropZone();
      }
    });

    // Hide drop zone when leaving
    document.addEventListener('dragleave', (e) => {
      // Only hide if leaving the document
      if (e.relatedTarget === null) {
        this.hideDropZone();
      }
    });

    // Handle drop on drop zone
    if (this.elements?.dropZone) {
      this.elements.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      this.elements.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.hideDropZone();
        this.handleDrop(e);
      });
    }
  }

  /**
   * Check if dataTransfer contains files
   */
  private hasFiles(dataTransfer: DataTransfer | null): boolean {
    if (!dataTransfer) {
      return false;
    }
    return (
      dataTransfer.types.includes('Files') || dataTransfer.types.includes('application/x-moz-file')
    );
  }

  /**
   * Show drop zone overlay
   */
  private showDropZone(): void {
    this.elements?.dropZone.classList.remove('hidden');
  }

  /**
   * Hide drop zone overlay
   */
  private hideDropZone(): void {
    this.elements?.dropZone.classList.add('hidden');
  }

  /**
   * Handle file drop event
   */
  handleDrop(e: DragEvent): void {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) {
      return;
    }

    // Signal state machine that we're processing files
    this.send({ type: 'DROP_FILES' });
    this.handleFiles(files);
  }

  /**
   * Handle file input (from drop or file picker)
   */
  async handleFiles(files: FileList): Promise<void> {
    const uploads: PendingUpload[] = [];

    for (const file of files) {
      // Check if it's an image
      if (file.type.startsWith('image/')) {
        const dataUrl = await this.readFileAsDataUrl(file);
        uploads.push({
          blob: file,
          dataUrl,
          name: file.name,
          mimeType: file.type
        });
      } else {
        // Non-image files - upload directly
        await this.uploadSingleFile(file);
      }
    }

    // If we have images, send to state machine
    if (uploads.length > 0) {
      this.send({ type: 'FILES_READY', uploads });
    } else if (this.getState() === 'processing') {
      // No images found, return to idle
      this.send({ type: 'ERROR', error: 'No images found' });
    }
  }

  /**
   * Read file as data URL
   */
  private readFileAsDataUrl(file: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Main smart paste function - detect content type and handle accordingly
   */
  async smartPaste(): Promise<boolean> {
    // Signal state machine
    this.send({ type: 'PASTE_REQUEST' });

    try {
      // Try to read clipboard items (for images)
      if (navigator.clipboard.read) {
        try {
          const items = await navigator.clipboard.read();

          for (const item of items) {
            // Check for images first
            for (const type of item.types) {
              if (type.startsWith('image/')) {
                const blob = await item.getType(type);

                // Generate filename
                const ext = type.split('/')[1] || 'png';
                const name = `clipboard-${this.formatTimestamp()}.${ext}`;

                // Upload directly without preview
                await this.uploadImageDirectly(blob, name, type);
                return true;
              }
            }
          }
        } catch (_err) {}
      }

      // Fall back to text paste - paste into input textarea
      const text = await navigator.clipboard.readText();
      if (text) {
        this.send({ type: 'TEXT_FOUND', text });
        if (this.inputTextarea) {
          // Paste into input textarea instead of sending directly to terminal
          this.inputTextarea.value = text;
          this.inputTextarea.focus();
          // Trigger input event to adjust textarea height
          this.inputTextarea.dispatchEvent(new Event('input', { bubbles: true }));
          this.historyManager.addToHistory(text);
          return true;
        }
        // Fallback: send directly to terminal if textarea not bound
        const result = this.inputHandler.sendText(text);
        if (result) {
          this.historyManager.addToHistory(text);
        }
        return result;
      }

      this.send({ type: 'ERROR', error: 'Clipboard is empty' });
      return false;
    } catch (err) {
      this.send({ type: 'ERROR', error: err instanceof Error ? err.message : 'Unknown error' });
      return false;
    }
  }

  /**
   * Format current timestamp for filename
   */
  private formatTimestamp(): string {
    const now = new Date();
    return now
      .toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '-')
      .replace(/\.\d{3}Z/, '');
  }

  /**
   * Check if preview modal is visible
   */
  isPreviewVisible(): boolean {
    const state = this.getState();
    return state === 'previewing' || state === 'uploading';
  }

  /**
   * Show preview modal (DOM operation)
   */
  private showPreviewModal(): void {
    this.elements?.previewModal.classList.remove('hidden');
  }

  /**
   * Hide preview modal (DOM operation)
   */
  private hidePreviewModal(): void {
    this.elements?.previewModal.classList.add('hidden');
  }

  /**
   * Show uploading state in UI
   */
  private showUploadingState(): void {
    if (!this.elements) {
      return;
    }
    this.elements.previewSubmit.disabled = true;
    this.elements.previewSubmit.textContent = 'アップロード中...';
  }

  /**
   * Render preview based on context
   */
  private renderPreview(context: SmartPasteContext): void {
    if (!this.elements || context.pendingUploads.length === 0) {
      return;
    }

    const current = context.pendingUploads[context.currentIndex];
    if (!current) {
      return;
    }

    // Reset submit button state
    this.elements.previewSubmit.disabled = false;

    // Update image
    this.elements.previewImg.src = current.dataUrl;
    this.elements.previewImg.alt = current.name;

    // Update counter
    this.elements.previewCounter.textContent = `${context.currentIndex + 1}/${context.pendingUploads.length}`;

    // Update submit button text
    const count = context.pendingUploads.length;
    this.elements.previewSubmit.textContent = count > 1 ? `送信 (${count}枚)` : '送信';

    // Update navigation buttons visibility
    const showNav = context.pendingUploads.length > 1;
    this.elements.previewPrev.style.display = showNav ? 'block' : 'none';
    this.elements.previewNext.style.display = showNav ? 'block' : 'none';

    // Update dots
    this.renderDots(context);

    // Show/hide remove button
    this.elements.previewRemove.style.display =
      context.pendingUploads.length > 0 ? 'block' : 'none';
  }

  /**
   * Render navigation dots
   */
  private renderDots(context: SmartPasteContext): void {
    if (!this.elements) {
      return;
    }

    this.elements.previewDots.innerHTML = '';

    if (context.pendingUploads.length <= 1) {
      return;
    }

    for (let i = 0; i < context.pendingUploads.length; i++) {
      const dot = document.createElement('span');
      dot.className = 'tui-preview-dot';
      dot.dataset.index = String(i);
      if (i === context.currentIndex) {
        dot.classList.add('active');
      }
      this.elements.previewDots.appendChild(dot);
    }
  }

  /**
   * Setup dot click handler using event delegation
   */
  private setupDotClickHandler(): void {
    if (!this.elements) {
      return;
    }

    this.elements.previewDots.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('tui-preview-dot') && target.dataset.index) {
        const index = Number.parseInt(target.dataset.index, 10);
        this.send({ type: 'GOTO', index });
      }
    });
  }

  /**
   * Get session name from URL
   */
  private getSessionName(): string {
    return getSessionNameFromURL(this.config.base_path);
  }

  /**
   * Handle submit button click
   */
  private handleSubmit(): void {
    if (this.getState() !== 'previewing') {
      return;
    }

    this.send({ type: 'SUBMIT' });
    this.uploadAll();
  }

  /**
   * Upload all pending images
   */
  async uploadAll(): Promise<void> {
    const context = this.getContext();
    if (context.pendingUploads.length === 0) {
      return;
    }

    try {
      const sessionName = this.getSessionName();
      if (!sessionName) {
        this.send({ type: 'UPLOAD_ERROR', error: 'セッション名を取得できませんでした' });
        return;
      }

      // Prepare images data
      const images = await Promise.all(
        context.pendingUploads.map(async (upload) => ({
          data: await blobToBase64(upload.blob),
          mimeType: upload.mimeType,
          name: upload.name
        }))
      );

      // Upload to server
      const response = await fetch(
        `${this.config.base_path}/api/clipboard-image?session=${encodeURIComponent(sessionName)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ images })
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Upload failed');
      }

      // Send success to state machine (paths will be sent in onStateChange)
      const paths = result.paths as string[];
      this.send({ type: 'UPLOAD_SUCCESS', paths });
    } catch (err) {
      this.send({
        type: 'UPLOAD_ERROR',
        error: err instanceof Error ? err.message : 'Unknown error'
      });
    }
  }

  /**
   * Upload a single non-image file
   */
  private async uploadSingleFile(file: File): Promise<void> {
    try {
      const sessionName = this.getSessionName();
      if (!sessionName) {
        return;
      }

      // Create form data
      const formData = new FormData();
      formData.append('file', file);

      // Upload to file upload endpoint
      const response = await fetch(
        `${this.config.base_path}/api/files/upload?session=${encodeURIComponent(sessionName)}`,
        {
          method: 'POST',
          body: formData
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Upload failed');
      }

      // Send path to terminal
      if (result.path) {
        this.inputHandler.sendText(result.path);
      }
    } catch (_err) {}
  }

  /**
   * Upload image directly without preview
   */
  private async uploadImageDirectly(blob: Blob, name: string, mimeType: string): Promise<void> {
    try {
      const sessionName = this.getSessionName();
      if (!sessionName) {
        return;
      }

      // Upload to server
      const base64 = await blobToBase64(blob);
      const response = await fetch(
        `${this.config.base_path}/api/clipboard-image?session=${encodeURIComponent(sessionName)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            images: [{ data: base64, mimeType, name }]
          })
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Upload failed');
      }

      // Paste path into input textarea
      if (result.paths && result.paths.length > 0) {
        const pathText = result.paths.join(' ');
        if (this.inputTextarea) {
          this.inputTextarea.value = pathText;
          this.inputTextarea.focus();
          this.inputTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          this.inputHandler.sendText(pathText);
        }
      }
    } catch (_err) {}
  }

  /**
   * Cleanup when manager is destroyed
   */
  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.actor.stop();
  }
}
