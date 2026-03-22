/**
 * Share Manager
 *
 * Handles read-only share link creation from the browser.
 */

import { BaseModal } from '@/browser/shared/BaseModal.js';
import type { Scope } from '@/browser/shared/lifecycle.js';
import type { TerminalUiConfig } from '@/browser/shared/types.js';
import { bindClickScoped, getSessionName } from '@/browser/shared/utils.js';
import qrcode from 'qrcode-generator';
import { type ToolbarApiClient, createApiClient } from './ApiClient.js';

export class ShareManager extends BaseModal {
  private config: TerminalUiConfig;
  private apiClient: ToolbarApiClient;
  private shareBtn: HTMLElement | null = null;
  private createBtn: HTMLElement | null = null;
  private resultSection: HTMLElement | null = null;
  private urlInput: HTMLInputElement | null = null;
  private copyBtn: HTMLElement | null = null;
  private qrBtn: HTMLElement | null = null;
  private expiryOptions: NodeListOf<HTMLInputElement> | null = null;

  constructor(config: TerminalUiConfig) {
    super({ backdropClose: true });
    this.config = config;
    this.apiClient = createApiClient({ basePath: config.base_path });
  }

  /**
   * Bind modal elements (stores reference only)
   */
  bindElements(elements: {
    shareBtn: HTMLElement;
    modal: HTMLElement;
    modalClose: HTMLElement;
    createBtn: HTMLElement;
    resultSection: HTMLElement;
    urlInput: HTMLInputElement;
    copyBtn: HTMLElement;
    qrBtn: HTMLElement;
  }): void {
    this.shareBtn = elements.shareBtn;
    this.createBtn = elements.createBtn;
    this.resultSection = elements.resultSection;
    this.urlInput = elements.urlInput;
    this.copyBtn = elements.copyBtn;
    this.qrBtn = elements.qrBtn;
    this.expiryOptions = document.querySelectorAll(
      'input[name="tui-share-expiry"]'
    ) as NodeListOf<HTMLInputElement>;

    // Bind modal to base class
    this.bindModal(elements.modal, elements.modalClose);
  }

  /**
   * Additional mount logic for ShareManager
   */
  protected onMount(scope: Scope): void {
    // Open modal
    bindClickScoped(scope, this.shareBtn, () => this.show());

    // Create share link
    bindClickScoped(scope, this.createBtn, () => this.createShare());

    // Copy URL
    bindClickScoped(scope, this.copyBtn, () => this.copyUrl());

    // Show QR code
    bindClickScoped(scope, this.qrBtn, () => this.showQR());
  }

  /**
   * Reset to initial state when showing
   */
  protected onShow(): void {
    this.resultSection?.classList.add('hidden');
    this.createBtn?.classList.remove('hidden');
  }

  /**
   * Get session name from config or URL
   */
  private getSessionNameValue(): string {
    return getSessionName(this.config);
  }

  /**
   * Get selected expiry value
   */
  private getSelectedExpiry(): string {
    if (!this.expiryOptions) {
      return '24h';
    }
    for (const option of this.expiryOptions) {
      if (option.checked) {
        return option.value;
      }
    }
    return '24h';
  }

  /**
   * Create a share link via API
   */
  async createShare(): Promise<void> {
    const basePath = this.config.base_path;
    const sessionName = this.getSessionNameValue();
    const expiresIn = this.getSelectedExpiry();

    if (!sessionName) {
      alert('セッション名を取得できませんでした');
      return;
    }

    try {
      // Disable create button
      if (this.createBtn) {
        this.createBtn.textContent = '作成中...';
        (this.createBtn as HTMLButtonElement).disabled = true;
      }

      const share = await this.apiClient.createShare(sessionName, expiresIn);
      const shareUrl = `${window.location.origin}${basePath}/share/${share.token}`;

      this.showResult(shareUrl);
    } catch (error) {
      alert(`共有リンクの作成に失敗しました: ${(error as Error).message}`);
    } finally {
      // Re-enable create button
      if (this.createBtn) {
        this.createBtn.textContent = 'リンクを作成';
        (this.createBtn as HTMLButtonElement).disabled = false;
      }
    }
  }

  /**
   * Show the result section with the share URL
   */
  private showResult(url: string): void {
    if (this.urlInput) {
      this.urlInput.value = url;
    }
    this.resultSection?.classList.remove('hidden');
    this.createBtn?.classList.add('hidden');
  }

  /**
   * Copy URL to clipboard
   */
  async copyUrl(): Promise<void> {
    if (!this.urlInput) {
      return;
    }

    try {
      await navigator.clipboard.writeText(this.urlInput.value);
      // Visual feedback
      const originalText = this.copyBtn?.textContent;
      if (this.copyBtn) {
        this.copyBtn.textContent = 'コピー完了!';
        setTimeout(() => {
          if (this.copyBtn) {
            this.copyBtn.textContent = originalText || 'コピー';
          }
        }, 2000);
      }
    } catch {
      // Fallback: select and copy
      this.urlInput.select();
      document.execCommand('copy');
      alert('URLをコピーしました');
    }
  }

  /**
   * Show QR code using qrcode-generator library
   */
  showQR(): void {
    if (!this.urlInput) {
      return;
    }

    const url = this.urlInput.value;

    try {
      // Generate QR code (type 0 = auto, L = low error correction)
      const qr = qrcode(0, 'L');
      qr.addData(url);
      qr.make();

      // Create data URL (4 = cell size, 4 = margin)
      const qrDataUrl = qr.createDataURL(4, 4);

      // Open QR code in a new window
      const qrWindow = window.open('', 'qrcode', 'width=250,height=280');
      if (qrWindow) {
        qrWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>QRコード</title>
            <style>
              body {
                font-family: sans-serif;
                text-align: center;
                background: #1e1e1e;
                color: #fff;
                margin: 0;
                padding: 16px;
              }
              img { display: block; margin: 0 auto; }
              p { font-size: 12px; margin-top: 8px; word-break: break-all; }
            </style>
          </head>
          <body>
            <img src="${qrDataUrl}" alt="QR Code" />
            <p>読み取り専用リンク</p>
          </body>
          </html>
        `);
        qrWindow.document.close();
      }
    } catch (_error) {
      alert('QRコードの生成に失敗しました');
    }
  }
}
