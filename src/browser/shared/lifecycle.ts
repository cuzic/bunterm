/**
 * Lifecycle Management
 *
 * Provides unified subscription management for DOM events and EventBus.
 * All subscriptions return Disposable functions that can be collected
 * in a Scope for batch cleanup.
 */

import type { Handler } from 'mitt';

/** Cleanup function type */
export type Disposable = () => void;

/**
 * Scope for managing multiple disposables.
 * Collects cleanup functions and disposes them in LIFO order.
 */
export class Scope {
  private disposables: Disposable[] = [];
  private closed = false;

  /**
   * Add a disposable to this scope.
   * If scope is already closed, the disposable is called immediately.
   * @returns The same disposable for chaining
   */
  add(d: Disposable): Disposable {
    if (this.closed) {
      d();
      return () => {};
    }
    this.disposables.push(d);
    return d;
  }

  /**
   * Close the scope and dispose all collected disposables in LIFO order.
   * After closing, any new disposables added will be called immediately.
   */
  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    // LIFO order for proper dependency cleanup
    for (let i = this.disposables.length - 1; i >= 0; i--) {
      try {
        this.disposables[i]();
      } catch {
        // Ignore errors during cleanup
      }
    }
    this.disposables = [];
  }

  /**
   * Check if the scope is closed
   */
  isClosed(): boolean {
    return this.closed;
  }

  /**
   * Create a child scope that is automatically closed when this scope closes.
   */
  createChild(): Scope {
    const child = new Scope();
    this.add(() => child.close());
    return child;
  }
}

/**
 * Add a DOM event listener with automatic cleanup via AbortController.
 * @param target - The event target (element, document, window)
 * @param type - Event type string
 * @param handler - Event handler function
 * @param options - AddEventListenerOptions (signal will be added automatically)
 * @returns Disposable function to remove the listener
 */
export function on(
  target: EventTarget,
  type: string,
  handler: EventListenerOrEventListenerObject,
  options: AddEventListenerOptions = {}
): Disposable {
  const controller = new AbortController();
  target.addEventListener(type, handler, { ...options, signal: controller.signal });
  return () => controller.abort();
}

/**
 * Bus interface for mitt-like event emitters
 */
export interface EventBus<T extends Record<string, unknown>> {
  on<K extends keyof T>(type: K, handler: Handler<T[K]>): void;
  off<K extends keyof T>(type: K, handler: Handler<T[K]>): void;
}

/**
 * Subscribe to an EventBus event with automatic cleanup.
 * @param bus - The event bus (mitt emitter)
 * @param type - Event type key
 * @param handler - Event handler function
 * @returns Disposable function to unsubscribe
 */
export function onBus<T extends Record<string, unknown>, K extends keyof T>(
  bus: EventBus<T>,
  type: K,
  handler: Handler<T[K]>
): Disposable {
  bus.on(type, handler);
  return () => bus.off(type, handler);
}

/**
 * Mountable interface for components that can be mounted to a scope.
 * Components implementing this interface register their event listeners
 * via the provided scope for automatic cleanup.
 */
export interface Mountable {
  /**
   * Mount the component, registering all event listeners via the scope.
   * @param scope - Scope to register cleanup functions
   */
  mount(scope: Scope): void;
}
