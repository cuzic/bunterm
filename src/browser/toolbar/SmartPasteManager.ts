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

import type { Mountable, Scope } from '@/browser/shared/lifecycle.js';
import type { SmartPasteElements, TerminalUiConfig } from '@/browser/shared/types.js';
import { bindBackdropClose, blobToBase64, getSessionNameFromURL } from '@/browser/shared/utils.js';
import { type Actor, createActor } from 'xstate';
import type { ClipboardHistoryManager } from './ClipboardHistoryManager.js';
import type { InputHandler } from './InputHandler.js';
import {
  type PendingUpload,
  type SmartPasteContext,
  type SmartPasteEvent,
  smartPasteMachine
} from './smartPasteMachine.js';

// Re-export PendingUpload from state machine
export type { PendingUpload } from './smartPasteMachine.js';

type SmartPasteActor = Actor<typeof smartPasteMachine>;

export class SmartPasteManager implements Mountable {
  private config: TerminalUiConfig;
  private inputHandler: InputHandler;
  private historyManager: ClipboardHistoryManager;
  private elements: SmartPasteElements | null = null;
  private actor: SmartPasteActor;
  private unsubscribe: (() => void) | null = null;
  private inputTextarea: HTMLTextAreaElement | null = null;
  private uploadAbortController: AbortController | null = null;

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
        // Abort any pending upload requests
        this.abortPendingUploads();
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
   * Abort any pending upload requests
   */
  private abortPendingUploads(): void {
    if (this.uploadAbortController) {
      this.uploadAbortController.abort();
      this.uploadAbortController = null;
    }
  }

  /**
   * Create a new AbortController for upload requests
   */
  private createUploadAbortController(): AbortSignal {
    this.abortPendingUploads();
    this.uploadAbortController = new AbortController();
    return this.uploadAbortController.signal;
  }

  /**
   * Bind DOM elements for preview modal and drop zone
   */
  bindElements(elements: SmartPasteElements): void {
    this.elements = elements;
  }

  /**
   * Bind input textarea for text paste
   */
  bindInputTextarea(textarea: HTMLTextAreaElement): void {
    this.inputTextarea = textarea;
  }

  /**
   * Mount event listeners to scope for automatic cleanup
   */
  mount(scope: Scope): void {
    if (!this.elements) {
      return;
    }

    // Modal control event listeners
    scope.on(this.elements.previewClose, 'click', () => {
      this.send({ type: 'CANCEL' });
    });

    scope.on(this.elements.previewCancel, 'click', () => {
      this.send({ type: 'CANCEL' });
    });

    scope.on(this.elements.previewSubmit, 'click', () => {
      this.handleSubmit();
    });

    scope.on(this.elements.previewPrev, 'click', () => {
      this.send({ type: 'PREV' });
    });

    scope.on(this.elements.previewNext, 'click', () => {
      this.send({ type: 'NEXT' });
    });

    scope.on(this.elements.previewRemove, 'click', () => {
      this.send({ type: 'REMOVE' });
    });

    // Close on backdrop click
    bindBackdropClose(scope, this.elements.previewModal, () => {
      this.send({ type: 'CANCEL' });
    });

    // Keyboard navigation
    scope.on(document, 'keydown', (e) => {
      if (!this.isPreviewVisible()) {
        return;
      }
      const event = e as KeyboardEvent;
      if (event.key === 'Escape') {
        event.preventDefault();
        this.send({ type: 'CANCEL' });
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.send({ type: 'PREV' });
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.send({ type: 'NEXT' });
      } else if (event.key === 'Enter') {
        event.preventDefault();
        this.handleSubmit();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        this.send({ type: 'REMOVE' });
      }
    });

    // Dot click handler (event delegation)
    scope.on(this.elements.previewDots, 'click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('tui-preview-dot') && target.dataset.index) {
        const index = Number.parseInt(target.dataset.index, 10);
        this.send({ type: 'GOTO', index });
      }
    });

    // Drag and drop zone setup
    scope.on(document, 'dragover', (e) => {
      e.preventDefault();
    });

    scope.on(document, 'drop', (e) => {
      e.preventDefault();
      this.hideDropZone();
    });

    scope.on(document, 'dragenter', (e) => {
      if (this.hasFiles((e as DragEvent).dataTransfer)) {
        this.showDropZone();
      }
    });

    scope.on(document, 'dragleave', (e) => {
      // Only hide if leaving the document
      if ((e as MouseEvent).relatedTarget === null) {
        this.hideDropZone();
      }
    });

    // Handle drop on drop zone element
    if (this.elements.dropZone) {
      scope.on(this.elements.dropZone, 'dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      scope.on(this.elements.dropZone, 'drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.hideDropZone();
        this.handleDrop(e as DragEvent);
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
        } catch (err) {
          console.error('[SmartPaste] Failed to read clipboard image:', err);
        }
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
   * Get session name from config or URL
   */
  private getSessionName(): string {
    // Use sessionName from config if available (server-provided), otherwise extract from URL
    return this.config.sessionName || getSessionNameFromURL(this.config.base_path);
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

      // Upload to server with abort signal
      const signal = this.createUploadAbortController();
      const response = await fetch(
        `${this.config.base_path}/api/clipboard-image?session=${encodeURIComponent(sessionName)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ images }),
          signal
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
        console.error('[SmartPaste] Cannot upload file: session name not available');
        return;
      }

      // Create form data
      const formData = new FormData();
      formData.append('file', file);

      // Upload to file upload endpoint with abort signal
      const signal = this.createUploadAbortController();
      const response = await fetch(
        `${this.config.base_path}/api/files/upload?session=${encodeURIComponent(sessionName)}`,
        {
          method: 'POST',
          body: formData,
          signal
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
    } catch (err) {
      console.error('[SmartPaste] Failed to upload file:', err);
    }
  }

  /**
   * Upload image directly without preview
   */
  private async uploadImageDirectly(blob: Blob, name: string, mimeType: string): Promise<void> {
    try {
      const sessionName = this.getSessionName();
      if (!sessionName) {
        console.error('[SmartPaste] Cannot upload image: session name not available');
        return;
      }

      // Upload to server with abort signal
      const base64 = await blobToBase64(blob);
      const signal = this.createUploadAbortController();
      const response = await fetch(
        `${this.config.base_path}/api/clipboard-image?session=${encodeURIComponent(sessionName)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            images: [{ data: base64, mimeType, name }]
          }),
          signal
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
    } catch (err) {
      console.error('[SmartPaste] Failed to upload image:', err);
    }
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
