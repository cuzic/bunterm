/**
 * LongPressHandler
 *
 * Reusable long press detection component.
 * Implements Mountable for automatic cleanup via Scope.
 */

import type { Mountable, Scope } from './lifecycle.js';

/** Configuration for LongPressHandler */
export interface LongPressConfig {
  /** Element to detect long press on */
  element: HTMLElement;
  /** Duration in ms to trigger long press (default: 500) */
  duration?: number;
  /** Move threshold in pixels to cancel long press (default: 10) */
  moveThreshold?: number;
  /** Callback when long press is detected */
  onLongPress: (pos: { x: number; y: number }) => void;
  /** Optional callback when long press is cancelled */
  onCancel?: () => void;
}

const DEFAULT_DURATION = 500;
const DEFAULT_MOVE_THRESHOLD = 10;

/**
 * Long press detection handler.
 * Detects long press gestures on an element and fires callback.
 */
export class LongPressHandler implements Mountable {
  private config: LongPressConfig;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private startPos: { x: number; y: number } | null = null;
  private triggered = false;

  constructor(config: LongPressConfig) {
    this.config = config;
  }

  /**
   * Mount event listeners to scope for automatic cleanup
   */
  mount(scope: Scope): void {
    const { element } = this.config;

    scope.on(element, 'pointerdown', (e: Event) => this.start(e as PointerEvent));
    scope.on(element, 'pointermove', (e: Event) => this.checkMove(e as PointerEvent));
    scope.on(element, 'pointerup', () => this.cancel());
    scope.on(element, 'pointercancel', () => this.cancel());
    scope.on(element, 'pointerleave', () => this.cancel());

    // Prevent context menu on long press
    scope.on(element, 'contextmenu', (e: Event) => {
      if (this.triggered) {
        e.preventDefault();
      }
    });
  }

  /**
   * Start long press detection
   */
  private start(e: PointerEvent): void {
    const duration = this.config.duration ?? DEFAULT_DURATION;

    this.triggered = false;
    this.startPos = { x: e.clientX, y: e.clientY };

    this.timer = setTimeout(() => {
      this.triggered = true;
      this.config.onLongPress(this.startPos!);
    }, duration);
  }

  /**
   * Check if pointer moved too far, cancel if so
   */
  private checkMove(e: PointerEvent): void {
    if (!this.startPos || !this.timer) {
      return;
    }

    const threshold = this.config.moveThreshold ?? DEFAULT_MOVE_THRESHOLD;
    const dx = Math.abs(e.clientX - this.startPos.x);
    const dy = Math.abs(e.clientY - this.startPos.y);

    if (dx > threshold || dy > threshold) {
      this.cancel();
    }
  }

  /**
   * Cancel long press detection
   */
  private cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.startPos = null;
    this.config.onCancel?.();
  }

  /**
   * Check if long press was triggered
   */
  isTriggered(): boolean {
    return this.triggered;
  }

  /**
   * Reset triggered state
   * Call this after handling the long press to allow normal clicks
   */
  resetTriggered(): void {
    this.triggered = false;
  }
}
