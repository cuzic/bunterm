/**
 * Terminal State Tracker
 *
 * Tracks the current terminal state (idle, busy, claude, selecting)
 * by listening to toolbar events. Used by MiniBar to show
 * context-appropriate buttons.
 */

import { toolbarEvents } from '@/browser/shared/events.js';
import type { Mountable, Scope } from '@/browser/shared/lifecycle.js';

export type TerminalState = 'idle' | 'busy' | 'claude' | 'selecting';

export class TerminalStateTracker implements Mountable {
  private _state: TerminalState = 'idle';
  private onChangeCallbacks: Set<(state: TerminalState) => void> = new Set();

  get state(): TerminalState {
    return this._state;
  }

  mount(scope: Scope): void {
    // Listen for block events (command execution)
    scope.onBus(toolbarEvents, 'block:start', () => this.setState('busy'));
    scope.onBus(toolbarEvents, 'block:end', () => this.setState('idle'));

    // Listen for Claude events
    scope.onBus(toolbarEvents, 'claude:toolUse', () => this.setState('claude'));
    scope.onBus(toolbarEvents, 'claude:sessionEnd', () => this.setState('idle'));

    // Listen for selection events
    scope.add(
      toolbarEvents.on('selection:change', (hasSelection) => {
        if (hasSelection && this._state === 'idle') {
          this.setState('selecting');
        } else if (!hasSelection && this._state === 'selecting') {
          this.setState('idle');
        }
      })
    );
  }

  onChange(cb: (state: TerminalState) => void): () => void {
    this.onChangeCallbacks.add(cb);
    return () => {
      this.onChangeCallbacks.delete(cb);
    };
  }

  private setState(newState: TerminalState): void {
    if (this._state === newState) return;
    this._state = newState;
    for (const cb of this.onChangeCallbacks) cb(newState);
  }
}
