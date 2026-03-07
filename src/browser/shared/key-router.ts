/**
 * Key Router
 *
 * Centralized keyboard event handling with priority-based routing.
 * Prevents multiple handlers from processing the same key event
 * and provides consistent priority ordering.
 */

import { type Disposable, type Scope, on } from './lifecycle.js';

/**
 * Key handler function.
 * @param e - The keyboard event
 * @returns true if the event was consumed, false to pass to next handler
 */
export type KeyHandler = (e: KeyboardEvent) => boolean;

interface HandlerEntry {
  priority: number;
  fn: KeyHandler;
}

/**
 * KeyRouter provides centralized keyboard event handling.
 *
 * Features:
 * - Priority-based routing (higher priority handlers run first)
 * - Event consumption (return true to stop propagation to lower priority handlers)
 * - Automatic cleanup via Disposable pattern
 *
 * Example:
 * ```typescript
 * const keys = new KeyRouter();
 * keys.mount(scope);
 *
 * // High priority: modal escape
 * scope.add(keys.register((e) => {
 *   if (e.key !== 'Escape' || !modal.isVisible()) return false;
 *   modal.hide();
 *   e.preventDefault();
 *   return true;
 * }, 100));
 *
 * // Low priority: toolbar toggle
 * scope.add(keys.register((e) => {
 *   if (e.key !== 'Escape') return false;
 *   toolbar.hide();
 *   e.preventDefault();
 *   return true;
 * }, 0));
 * ```
 */
export class KeyRouter {
  private handlers: HandlerEntry[] = [];

  /**
   * Register a key handler with optional priority.
   * Higher priority handlers run first.
   * @param fn - Handler function that returns true if event was consumed
   * @param priority - Priority level (default: 0, higher = runs first)
   * @returns Disposable to unregister the handler
   */
  register(fn: KeyHandler, priority = 0): Disposable {
    const entry: HandlerEntry = { priority, fn };
    this.handlers.push(entry);
    this.handlers.sort((a, b) => b.priority - a.priority);

    return () => {
      const index = this.handlers.indexOf(entry);
      if (index !== -1) {
        this.handlers.splice(index, 1);
      }
    };
  }

  /**
   * Internal handler that routes events to registered handlers.
   * Stops at the first handler that returns true.
   */
  private handle = (e: KeyboardEvent): void => {
    for (const handler of this.handlers) {
      if (handler.fn(e)) {
        return; // Event consumed
      }
    }
  };

  /**
   * Mount the router to a scope, adding the document keydown listener.
   * @param scope - Scope for automatic cleanup
   */
  mount(scope: Scope): void {
    scope.add(on(document, 'keydown', this.handle, { capture: true }));
  }
}

/**
 * Common key priorities for consistent ordering.
 * Higher values = higher priority = runs first.
 */
export const KeyPriority = {
  /** Highest priority - image preview, critical modals */
  CRITICAL: 200,
  /** High priority - modals that should close before others */
  MODAL_HIGH: 100,
  /** Medium priority - standard modals */
  MODAL: 80,
  /** Low priority - panes, panels */
  PANE: 60,
  /** Lower priority - search bar */
  SEARCH: 40,
  /** Lowest priority - global shortcuts */
  GLOBAL: 0
} as const;
