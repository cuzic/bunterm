/**
 * Toolbar Event Bus
 *
 * Centralized event system for toolbar components using mitt.
 * Enables loose coupling between managers.
 */

import mittModule, { type Emitter, type Handler, type WildcardHandler } from 'mitt';

// mitt exports default function, but TypeScript module resolution may wrap it
const mitt = mittModule as unknown as <Events extends Record<string, unknown>>(
  all?: unknown
) => Emitter<Events>;

/**
 * Toolbar event types with their payloads
 */
export type ToolbarEvents = {
  // Paste operations
  'paste:request': undefined;
  'text:send': string;
  'clipboard:copy': string;

  // Modal control
  'modal:open': ModalName;
  'modal:close': ModalName;

  // Toolbar UI
  'toolbar:toggle': undefined;
  'search:toggle': undefined;

  // Notifications
  'notification:bell': undefined;

  // Font
  'font:change': number;

  // Session
  'session:open': undefined;

  // Upload
  'upload:progress': { current: number; total: number };
  'upload:complete': string[];

  // Block UI state
  'block:start': undefined;
  'block:end': undefined;

  // Claude watcher state
  'claude:toolUse': undefined;
  'claude:sessionEnd': undefined;

  // Selection state
  'selection:change': boolean;

  // Toast notifications
  'toast:show': { message: string; type: 'info' | 'error' | 'success' };

  // Errors
  error: Error;
};

/**
 * Modal names for type safety
 */
export type ModalName = 'snippet' | 'preview' | 'share' | 'file' | 'clipboard-history' | 'session';

/**
 * Toolbar event bus interface
 */
export interface ToolbarEventBus {
  /**
   * Register an event handler
   * @returns Unsubscribe function
   */
  on<K extends keyof ToolbarEvents>(type: K, handler: Handler<ToolbarEvents[K]>): () => void;

  /**
   * Register a wildcard handler that receives all events
   * @returns Unsubscribe function
   */
  on(type: '*', handler: WildcardHandler<ToolbarEvents>): () => void;

  /**
   * Remove an event handler
   */
  off<K extends keyof ToolbarEvents>(type: K, handler: Handler<ToolbarEvents[K]>): void;

  /**
   * Remove a wildcard handler
   */
  off(type: '*', handler: WildcardHandler<ToolbarEvents>): void;

  /**
   * Emit an event
   */
  emit<K extends keyof ToolbarEvents>(
    type: K,
    ...args: ToolbarEvents[K] extends void ? [] : [ToolbarEvents[K]]
  ): void;
}

/**
 * Create a new toolbar event bus instance
 */
export function createToolbarEventBus(): ToolbarEventBus {
  const emitter: Emitter<ToolbarEvents> = mitt<ToolbarEvents>();

  return {
    on(type: string, handler: Handler<unknown> | WildcardHandler<ToolbarEvents>) {
      emitter.on(type as keyof ToolbarEvents, handler as Handler<unknown>);
      return () => {
        emitter.off(type as keyof ToolbarEvents, handler as Handler<unknown>);
      };
    },

    off(type: string, handler: Handler<unknown> | WildcardHandler<ToolbarEvents>) {
      emitter.off(type as keyof ToolbarEvents, handler as Handler<unknown>);
    },

    emit(type: keyof ToolbarEvents, event?: unknown) {
      emitter.emit(type, event as ToolbarEvents[typeof type]);
    }
  };
}

/**
 * Default shared event bus instance for the toolbar
 */
export const toolbarEvents = createToolbarEventBus();
