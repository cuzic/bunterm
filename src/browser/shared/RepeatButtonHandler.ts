/**
 * RepeatButtonHandler
 *
 * Handles button long press with continuous repeat action.
 * Similar to keyboard key repeat behavior.
 * Implements Mountable for automatic cleanup via Scope.
 */

import type { Mountable, Scope } from './lifecycle.js';

/** Configuration for RepeatButtonHandler */
export interface RepeatButtonConfig {
  /** Button element to attach handlers to */
  element: HTMLElement;
  /** Action to execute on press and repeat */
  action: () => void;
  /** Initial delay before repeat starts (default: 300ms) */
  initialDelay?: number;
  /** Repeat interval (default: 100ms) */
  repeatInterval?: number;
}

const DEFAULT_INITIAL_DELAY = 300;
const DEFAULT_REPEAT_INTERVAL = 100;

/**
 * Button long press repeat handler.
 * Executes action immediately on press, then repeats after initial delay.
 */
export class RepeatButtonHandler implements Mountable {
  private config: RepeatButtonConfig;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(config: RepeatButtonConfig) {
    this.config = config;
  }

  /**
   * Mount event listeners to scope for automatic cleanup
   */
  mount(scope: Scope): void {
    const { element } = this.config;

    // Mouse events
    scope.on(element, 'mousedown', () => this.start());
    scope.on(element, 'mouseup', () => this.stop());
    scope.on(element, 'mouseleave', () => this.stop());

    // Touch events
    scope.on(element, 'touchstart', (e: Event) => {
      e.preventDefault();
      this.start();
    });
    scope.on(element, 'touchend', () => this.stop());
    scope.on(element, 'touchcancel', () => this.stop());

    // Stop on window blur
    scope.on(window, 'blur', () => this.stop());
  }

  /**
   * Start the repeat action
   */
  private start(): void {
    // Guard against double-fire (touch + mouse)
    if (this.timer || this.interval) {
      return;
    }

    const { action, initialDelay, repeatInterval } = this.config;
    const delay = initialDelay ?? DEFAULT_INITIAL_DELAY;
    const interval = repeatInterval ?? DEFAULT_REPEAT_INTERVAL;

    // Execute action immediately
    action();

    // Start repeat after initial delay
    this.timer = setTimeout(() => {
      this.timer = null;
      this.interval = setInterval(() => action(), interval);
    }, delay);
  }

  /**
   * Stop the repeat action
   */
  private stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}
