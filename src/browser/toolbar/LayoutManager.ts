/**
 * Layout Manager
 *
 * Single source of truth for viewport and toolbar height calculations.
 * Uses visualViewport API for accurate mobile keyboard handling.
 *
 * CSS variables managed:
 * - --vvh: Visual viewport height in px
 * - --tui-h: Toolbar height in px
 */

import type { Scope } from './lifecycle.js';

export class LayoutManager {
  private toolbarEl: HTMLElement;
  private fitFn: () => void;
  private rafId = 0;
  private resizeObserver: ResizeObserver | null = null;
  private disposed = false;

  constructor(toolbarEl: HTMLElement, fitFn: () => void) {
    this.toolbarEl = toolbarEl;
    this.fitFn = fitFn;
  }

  /**
   * Get visual viewport height (keyboard-aware)
   */
  private getViewportHeightPx(): number {
    const vv = window.visualViewport;
    if (vv) {
      return Math.round(vv.height);
    }
    // Fallback for older browsers
    return window.innerHeight;
  }

  /**
   * Get visual viewport offset top (for iOS keyboard push)
   */
  private getViewportOffsetTop(): number {
    const vv = window.visualViewport;
    if (vv) {
      return Math.round(vv.offsetTop);
    }
    return 0;
  }

  /**
   * Measure actual toolbar height
   */
  private measureToolbarHeightPx(): number {
    if (this.toolbarEl.classList.contains('hidden')) {
      return 0;
    }
    return Math.round(this.toolbarEl.getBoundingClientRect().height);
  }

  /**
   * Schedule layout update (debounced via RAF)
   */
  scheduleUpdate(): void {
    if (this.disposed) return;

    cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(() => {
      if (this.disposed) return;
      this.updateLayout();
    });
  }

  /**
   * Update CSS variables and fit terminal
   */
  private updateLayout(): void {
    const vvh = this.getViewportHeightPx();
    const tuiH = this.measureToolbarHeightPx();
    const offsetTop = this.getViewportOffsetTop();

    const root = document.documentElement;
    root.style.setProperty('--vvh', `${vvh}px`);
    root.style.setProperty('--tui-h', `${tuiH}px`);
    root.style.setProperty('--vv-offset-top', `${offsetTop}px`);

    // Force synchronous reflow before fitting terminal
    // This ensures CSS variables are applied before we calculate terminal size
    void document.body.offsetHeight;

    // Call fit function (xterm fitAddon)
    this.fitFn();
  }

  /**
   * Force immediate layout update (bypass RAF)
   */
  forceUpdate(): void {
    if (this.disposed) return;
    cancelAnimationFrame(this.rafId);
    this.updateLayout();
  }

  /**
   * Mount event listeners to scope for automatic cleanup
   */
  mount(scope: Scope): void {
    const onChange = () => this.scheduleUpdate();

    // Window resize (fallback)
    window.addEventListener('resize', onChange, { passive: true });
    scope.add(() => window.removeEventListener('resize', onChange));

    // Visual Viewport events (primary for mobile)
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', onChange, { passive: true });
      vv.addEventListener('scroll', onChange, { passive: true });
      scope.add(() => {
        vv.removeEventListener('resize', onChange);
        vv.removeEventListener('scroll', onChange);
      });
    }

    // ResizeObserver for toolbar (handles button wrap, minimize, etc.)
    this.resizeObserver = new ResizeObserver(onChange);
    this.resizeObserver.observe(this.toolbarEl);
    scope.add(() => {
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
    });

    // Mark as disposed when scope closes
    scope.add(() => {
      this.disposed = true;
      cancelAnimationFrame(this.rafId);
    });

    // Initial layout
    this.forceUpdate();
  }
}
