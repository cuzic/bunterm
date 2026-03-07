/**
 * Touch Gesture Handler
 *
 * Handles touch gestures for mobile devices:
 * - Pinch-to-zoom for font size
 * - Scroll drag mode
 * - Double-tap to send Enter
 * - Shift+touch for text selection
 */

import type { InputHandler } from './InputHandler.js';
import type { ModifierKeyState } from './ModifierKeyState.js';
import type { TerminalController } from './TerminalController.js';
import { toolbarEvents } from './events.js';
import { type Mountable, type Scope, on } from './lifecycle.js';
import type { TerminalUiConfig } from './types.js';

// Safari GestureEvent type declaration (not in standard DOM types)
declare global {
  interface GestureEvent extends UIEvent {
    scale: number;
    rotation: number;
  }
}

const SCROLL_THRESHOLD = 30; // Pixels to drag before triggering scroll
const EDGE_SWIPE_THRESHOLD = 30; // Pixels from edge to start swipe detection
const SWIPE_HORIZONTAL_THRESHOLD = 100; // Minimum horizontal distance for swipe
const SWIPE_VERTICAL_LIMIT = 50; // Maximum vertical distance for swipe
const ALT_SCROLL_THRESHOLD = 12; // Pixels to drag for one wheel tick (smaller = faster)
const ALT_SCROLL_MULTIPLIER = 1; // Send multiple wheel events per tick for faster scrolling

export class TouchGestureHandler implements Mountable {
  private config: TerminalUiConfig;
  private terminal: TerminalController;
  private input: InputHandler;
  private modifiers: ModifierKeyState;

  private touchStartPos: { x: number; y: number } | null = null;
  private shiftTouchActive = false;
  private scrollTouchActive = false;
  private scrollLastY = 0;
  private pinchStartDistance = 0;
  private pinchStartFontSize: number;
  private lastTapTime = 0;
  private scrollActive = false;

  private scrollBtn: HTMLElement | null = null;

  // Edge swipe for session switcher
  private edgeSwipeStartX = 0;
  private edgeSwipeStartY = 0;
  private edgeSwipeStartedFromEdge = false;

  // Modifier+swipe scroll state
  private modifierScrollActive = false;
  private modifierScrollLastY = 0;
  private modifierScrollMode: 'alt' | 'ctrl' | null = null;

  constructor(
    config: TerminalUiConfig,
    terminal: TerminalController,
    input: InputHandler,
    modifiers: ModifierKeyState
  ) {
    this.config = config;
    this.terminal = terminal;
    this.input = input;
    this.modifiers = modifiers;
    this.pinchStartFontSize = terminal.getDefaultFontSize();
  }

  /**
   * Bind scroll button for state management
   */
  bindScrollButton(scrollBtn: HTMLElement): void {
    this.scrollBtn = scrollBtn;
  }

  /**
   * Toggle scroll mode
   */
  toggleScrollMode(): boolean {
    this.scrollActive = !this.scrollActive;
    this.scrollBtn?.classList.toggle('active', this.scrollActive);
    if (this.scrollActive) {
    } else {
    }
    return this.scrollActive;
  }

  /**
   * Check if scroll mode is active
   */
  isScrollActive(): boolean {
    return this.scrollActive;
  }

  /**
   * Setup all touch event handlers (legacy method)
   * @deprecated Use mount(scope) instead for automatic cleanup
   */
  setup(): void {
    // Create a temporary scope that is never closed (legacy behavior)
    const scope = new (class {
      add(d: () => void) {
        return d;
      }
    })() as Scope;
    this.mount(scope);
  }

  /**
   * Mount all touch event handlers to a scope for automatic cleanup
   */
  mount(scope: Scope): void {
    this.mountShiftMouseInjection(scope);
    this.mountTouchSelection(scope);
    this.mountPinchZoom(scope);
    this.mountWheelZoom(scope);
    this.mountDoubleTap(scope);
    this.mountEdgeSwipe(scope);
    this.mountModifierScroll(scope);
    this.mountMobileKeyboardSuppress(scope);
  }

  /**
   * Suppress keyboard popup on mobile when tapping terminal
   * Users should use the toolbar input field for typing
   */
  private mountMobileKeyboardSuppress(scope: Scope): void {
    // Only apply on touch devices
    if (!('ontouchstart' in window)) {
      return;
    }

    // Prevent xterm.js helper textarea from receiving focus on tap
    scope.add(
      on(
        document,
        'touchend',
        (e: Event) => {
          const target = (e as TouchEvent).target as HTMLElement;

          // Check if tap is on terminal screen area
          if (target.closest('.xterm-screen') || target.closest('.xterm')) {
            // Small delay to let xterm process the touch, then blur
            setTimeout(() => {
              const helperTextarea = document.querySelector(
                '.xterm-helper-textarea'
              ) as HTMLElement;
              if (helperTextarea && document.activeElement === helperTextarea) {
                helperTextarea.blur();
              }
            }, 10);
          }
        },
        { passive: true }
      )
    );
  }

  /**
   * Inject shiftKey into mouse events when Shift button is active
   */
  private mountShiftMouseInjection(scope: Scope): void {
    const eventTypes: ('mousedown' | 'mousemove' | 'mouseup')[] = [
      'mousedown',
      'mousemove',
      'mouseup'
    ];

    for (const eventType of eventTypes) {
      scope.add(
        on(
          document,
          eventType,
          (e: Event) => {
            const me = e as MouseEvent;
            // Don't interfere with toolbar buttons
            if (
              (me.target as HTMLElement).closest('#tui') ||
              (me.target as HTMLElement).closest('#tui-toggle')
            ) {
              return;
            }

            if (this.modifiers.isShiftActive() && !me.shiftKey) {
              const newEvent = new MouseEvent(me.type, {
                bubbles: me.bubbles,
                cancelable: me.cancelable,
                view: me.view,
                detail: me.detail,
                screenX: me.screenX,
                screenY: me.screenY,
                clientX: me.clientX,
                clientY: me.clientY,
                ctrlKey: me.ctrlKey,
                altKey: me.altKey,
                shiftKey: true,
                metaKey: me.metaKey,
                button: me.button,
                buttons: me.buttons,
                relatedTarget: me.relatedTarget
              });
              me.stopImmediatePropagation();
              me.preventDefault();
              (me.target as HTMLElement).dispatchEvent(newEvent);
            }
          },
          { capture: true }
        )
      );
    }
  }

  /**
   * Dispatch mouse event from touch
   */
  private dispatchMouseEvent(type: string, touch: Touch, shiftKey: boolean): void {
    const mouseEvent = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      detail: 1,
      screenX: touch.screenX,
      screenY: touch.screenY,
      clientX: touch.clientX,
      clientY: touch.clientY,
      ctrlKey: false,
      altKey: false,
      shiftKey: shiftKey,
      metaKey: false,
      button: 0,
      buttons: type === 'mouseup' ? 0 : 1,
      relatedTarget: null
    });
    (touch.target as HTMLElement).dispatchEvent(mouseEvent);
  }

  /**
   * Setup touch selection (Shift+touch and scroll drag)
   */
  private mountTouchSelection(scope: Scope): void {
    scope.add(
      on(
        document,
        'touchstart',
        (e: Event) => {
          const te = e as TouchEvent;
          const target = te.target as HTMLElement;

          // Don't interfere with toolbar buttons
          if (target.closest('#tui') || target.closest('#tui-toggle')) {
            return;
          }

          // Single finger touch with Scroll active -> enable scroll drag mode
          if (te.touches.length === 1 && this.scrollActive) {
            const touch = te.touches[0];
            this.touchStartPos = { x: touch.clientX, y: touch.clientY };
            this.scrollLastY = touch.clientY;
            this.scrollTouchActive = true;
            te.preventDefault();
          }
          // Single finger touch with Shift active -> convert to mouse event for selection
          else if (te.touches.length === 1 && this.modifiers.isShiftActive()) {
            const touch = te.touches[0];
            this.touchStartPos = { x: touch.clientX, y: touch.clientY };
            this.shiftTouchActive = true;
            te.preventDefault();
            this.dispatchMouseEvent('mousedown', touch, true);
          }
          // 2nd finger added -> cancel Shift/Scroll mode, allow pinch
          else if (te.touches.length === 2 && (this.shiftTouchActive || this.scrollTouchActive)) {
            if (this.shiftTouchActive) {
              this.dispatchMouseEvent('mouseup', te.touches[0], true);
            }
            this.shiftTouchActive = false;
            this.scrollTouchActive = false;
            this.touchStartPos = null;
            // Don't preventDefault - let pinch handlers take over
          }
          // Track non-Shift/Scroll single touch for hint
          else if (
            te.touches.length === 1 &&
            !this.modifiers.isShiftActive() &&
            !this.scrollActive
          ) {
            const touch = te.touches[0];
            this.touchStartPos = { x: touch.clientX, y: touch.clientY };
          }
        },
        { passive: false, capture: true }
      )
    );

    scope.add(
      on(
        document,
        'touchmove',
        (e: Event) => {
          const te = e as TouchEvent;
          // Handle scroll drag mode
          if (te.touches.length === 1 && this.scrollTouchActive) {
            te.preventDefault();
            const touch = te.touches[0];
            const deltaY = this.scrollLastY - touch.clientY;

            // Trigger scroll when threshold is reached
            if (Math.abs(deltaY) >= SCROLL_THRESHOLD) {
              if (deltaY > 0) {
                this.input.sendPage('down');
              } else {
                this.input.sendPage('up');
              }
              this.scrollLastY = touch.clientY;
            }
          }
          // Handle Shift selection mode
          else if (te.touches.length === 1 && this.shiftTouchActive) {
            te.preventDefault();
            this.dispatchMouseEvent('mousemove', te.touches[0], true);
          }
          // Don't interfere with 2-finger gestures (pinch)
        },
        { passive: false, capture: true }
      )
    );

    scope.add(
      on(
        document,
        'touchend',
        (e: Event) => {
          const te = e as TouchEvent;
          // Scroll mode ending
          if (this.scrollTouchActive && te.touches.length === 0) {
            this.scrollTouchActive = false;
            this.touchStartPos = null;
          }
          // Shift selection mode ending
          else if (this.shiftTouchActive && te.touches.length === 0) {
            const touch = te.changedTouches[0];
            this.dispatchMouseEvent('mouseup', touch, true);
            this.shiftTouchActive = false;
            this.touchStartPos = null;
          }
        },
        { passive: true, capture: true }
      )
    );
  }

  /**
   * Get distance between two touch points
   */
  private getTouchDistance(touches: TouchList): number {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Setup pinch-to-zoom for font size
   * Works with 2-finger pinch gesture (no modifier keys required)
   */
  private mountPinchZoom(scope: Scope): void {
    scope.add(
      on(
        document,
        'touchstart',
        (e: Event) => {
          const te = e as TouchEvent;
          if (te.touches.length === 2) {
            this.pinchStartDistance = this.getTouchDistance(te.touches);
            this.pinchStartFontSize = this.terminal.getCurrentFontSize();
          }
        },
        { passive: true }
      )
    );

    scope.add(
      on(
        document,
        'touchmove',
        (e: Event) => {
          const te = e as TouchEvent;
          if (te.touches.length === 2 && this.pinchStartDistance > 0) {
            te.preventDefault(); // Suppress browser zoom
            const currentDistance = this.getTouchDistance(te.touches);
            const scale = currentDistance / this.pinchStartDistance;
            const newSize = Math.round(this.pinchStartFontSize * scale);
            const clampedSize = Math.max(
              this.config.font_size_min,
              Math.min(this.config.font_size_max, newSize)
            );

            const currentSize = this.terminal.getCurrentFontSize();
            if (currentSize !== clampedSize) {
              this.terminal.setFontSize(clampedSize);
            }
          }
        },
        { passive: false }
      )
    );

    scope.add(
      on(
        document,
        'touchend',
        (e: Event) => {
          const te = e as TouchEvent;
          if (te.touches.length < 2 && this.pinchStartDistance > 0) {
            // Pinch gesture completed - emit font change event
            toolbarEvents.emit('font:change', this.terminal.getCurrentFontSize());
            this.pinchStartDistance = 0;
          }
        },
        { passive: true }
      )
    );
  }

  /**
   * Setup Ctrl+Wheel / Trackpad pinch zoom
   */
  private mountWheelZoom(scope: Scope): void {
    // Use capture phase to intercept before browser's default zoom handling
    scope.add(
      on(
        document,
        'wheel',
        (e: Event) => {
          const we = e as WheelEvent;
          // Skip events targeting preview pane (let iframe handle its own scrolling)
          const target = we.target as HTMLElement;
          if (target.closest('#tui-preview-pane')) {
            return;
          }

          // ctrlKey = trackpad pinch (Mac/Windows Precision Touchpad) or Ctrl+scroll
          if (we.ctrlKey) {
            we.preventDefault(); // Suppress browser zoom
            we.stopPropagation(); // Prevent other handlers

            // deltaY > 0: zoom out, deltaY < 0: zoom in
            const delta = we.deltaY > 0 ? -2 : 2;
            if (this.terminal.zoomTerminal(delta)) {
              toolbarEvents.emit('font:change', this.terminal.getCurrentFontSize());
            }
          }
        },
        { passive: false, capture: true } // capture phase for priority
      )
    );

    // Safari gesture events for trackpad pinch
    this.mountSafariGestureZoom(scope);
  }

  /**
   * Setup Safari gesture events for trackpad pinch zoom
   * Safari uses gesturestart/gesturechange/gestureend instead of wheel+ctrlKey
   */
  private mountSafariGestureZoom(scope: Scope): void {
    // Check if gesture events are supported (Safari)
    if (!('ongesturestart' in window)) {
      return;
    }

    let gestureStartFontSize = this.terminal.getCurrentFontSize();

    scope.add(
      on(document, 'gesturestart', (e: Event) => {
        const target = e.target as HTMLElement;
        if (
          target.closest('#tui-preview-pane') ||
          target.closest('#tui') ||
          target.closest('#tui-toggle')
        ) {
          return;
        }
        e.preventDefault();
        gestureStartFontSize = this.terminal.getCurrentFontSize();
      })
    );

    scope.add(
      on(document, 'gesturechange', (e: Event) => {
        const target = e.target as HTMLElement;
        if (
          target.closest('#tui-preview-pane') ||
          target.closest('#tui') ||
          target.closest('#tui-toggle')
        ) {
          return;
        }
        e.preventDefault();

        // GestureEvent has scale property
        const gestureEvent = e as GestureEvent;
        const scale = gestureEvent.scale || 1;
        const newSize = Math.round(gestureStartFontSize * scale);
        const clampedSize = Math.max(
          this.config.font_size_min,
          Math.min(this.config.font_size_max, newSize)
        );

        const currentSize = this.terminal.getCurrentFontSize();
        if (currentSize !== clampedSize) {
          this.terminal.setFontSize(clampedSize);
        }
      })
    );

    scope.add(
      on(document, 'gestureend', (e: Event) => {
        const target = e.target as HTMLElement;
        if (
          target.closest('#tui-preview-pane') ||
          target.closest('#tui') ||
          target.closest('#tui-toggle')
        ) {
          return;
        }
        e.preventDefault();
        toolbarEvents.emit('font:change', this.terminal.getCurrentFontSize());
      })
    );
  }

  /**
   * Setup double-tap to send Enter
   */
  private mountDoubleTap(scope: Scope): void {
    scope.add(
      on(
        document,
        'touchend',
        (e: Event) => {
          const te = e as TouchEvent;
          const target = te.target as HTMLElement;

          // Exclude toolbar elements
          if (target.closest('#tui') || target.closest('#tui-toggle')) {
            return;
          }

          // Single touch only
          if (te.changedTouches.length !== 1) {
            return;
          }

          const now = Date.now();
          if (now - this.lastTapTime < this.config.double_tap_delay) {
            // Double tap detected -> send Enter
            this.input.sendEnter();
            this.lastTapTime = 0;
          } else {
            this.lastTapTime = now;
          }
        },
        { passive: true }
      )
    );
  }

  /**
   * Setup edge swipe from right to open session switcher
   * Detection: Touch starts within 30px of right edge, swipe left 100px+ with <50px vertical movement
   */
  private mountEdgeSwipe(scope: Scope): void {
    scope.add(
      on(
        document,
        'touchstart',
        (e: Event) => {
          const te = e as TouchEvent;
          const target = te.target as HTMLElement;

          // Don't interfere with toolbar or modals
          if (
            target.closest('#tui') ||
            target.closest('#tui-toggle') ||
            target.closest('#tui-session-modal') ||
            target.closest('#tui-snippet-modal') ||
            target.closest('#tui-share-modal') ||
            target.closest('#tui-file-modal')
          ) {
            this.edgeSwipeStartedFromEdge = false;
            return;
          }

          if (te.touches.length === 1) {
            const touch = te.touches[0];
            const screenWidth = window.innerWidth;

            // Check if touch started from right edge
            if (screenWidth - touch.clientX <= EDGE_SWIPE_THRESHOLD) {
              this.edgeSwipeStartX = touch.clientX;
              this.edgeSwipeStartY = touch.clientY;
              this.edgeSwipeStartedFromEdge = true;
            } else {
              this.edgeSwipeStartedFromEdge = false;
            }
          }
        },
        { passive: true }
      )
    );

    scope.add(
      on(
        document,
        'touchend',
        (e: Event) => {
          const te = e as TouchEvent;
          if (!this.edgeSwipeStartedFromEdge) {
            return;
          }

          if (te.changedTouches.length === 1) {
            const touch = te.changedTouches[0];
            const deltaX = this.edgeSwipeStartX - touch.clientX; // Positive = swipe left
            const deltaY = Math.abs(touch.clientY - this.edgeSwipeStartY);

            // Check if this is a valid left swipe
            if (deltaX >= SWIPE_HORIZONTAL_THRESHOLD && deltaY < SWIPE_VERTICAL_LIMIT) {
              // Emit session:open event
              toolbarEvents.emit('session:open');
            }
          }

          this.edgeSwipeStartedFromEdge = false;
        },
        { passive: true }
      )
    );
  }

  /**
   * Setup modifier+swipe scroll gestures
   * - Alt + swipe: Send mouse wheel events to PTY (for tmux with 'set -g mouse on')
   * - Ctrl + swipe: Local xterm.js scrollback scroll (for non-tmux or tmux without mouse)
   */
  private mountModifierScroll(scope: Scope): void {
    scope.add(
      on(
        document,
        'touchstart',
        (e: Event) => {
          const te = e as TouchEvent;
          const target = te.target as HTMLElement;

          // Don't interfere with toolbar or modals
          if (
            target.closest('#tui') ||
            target.closest('#tui-toggle') ||
            target.closest('#tui-session-modal') ||
            target.closest('#tui-snippet-modal') ||
            target.closest('#tui-share-modal') ||
            target.closest('#tui-file-modal')
          ) {
            return;
          }

          // Single finger touch with Alt or Ctrl active -> enable scroll mode
          if (te.touches.length === 1) {
            if (this.modifiers.isAltActive()) {
              this.modifierScrollActive = true;
              this.modifierScrollLastY = te.touches[0].clientY;
              this.modifierScrollMode = 'alt';
              te.preventDefault();
            } else if (this.modifiers.isCtrlActive()) {
              this.modifierScrollActive = true;
              this.modifierScrollLastY = te.touches[0].clientY;
              this.modifierScrollMode = 'ctrl';
              te.preventDefault();
            }
          }
        },
        { passive: false, capture: true }
      )
    );

    scope.add(
      on(
        document,
        'touchmove',
        (e: Event) => {
          const te = e as TouchEvent;
          if (!this.modifierScrollActive || te.touches.length !== 1) {
            return;
          }

          const touch = te.touches[0];
          const deltaY = this.modifierScrollLastY - touch.clientY;

          if (Math.abs(deltaY) >= ALT_SCROLL_THRESHOLD) {
            const ticks = Math.floor(Math.abs(deltaY) / ALT_SCROLL_THRESHOLD);
            const direction = deltaY > 0 ? 'down' : 'up';

            if (this.modifierScrollMode === 'alt') {
              // Alt + swipe: Send mouse wheel to PTY (for tmux)
              this.input.sendWheel(direction, ticks * ALT_SCROLL_MULTIPLIER);
            } else {
              // Ctrl + swipe: Local xterm.js scroll
              const scrollAmount = deltaY > 0 ? -ticks : ticks;
              this.terminal.scrollLines(scrollAmount);
            }
            this.modifierScrollLastY = touch.clientY;
          }
          // Note: Not calling preventDefault() here to allow browser repaints during touch
        },
        { passive: true, capture: true }
      )
    );

    scope.add(
      on(
        document,
        'touchend',
        () => {
          if (this.modifierScrollActive) {
            // Force xterm.js refresh after touch ends
            // Mobile browsers may pause rendering during touch operations
            this.terminal.refresh();
          }
          this.modifierScrollActive = false;
          this.modifierScrollMode = null;
        },
        { passive: true, capture: true }
      )
    );

    scope.add(
      on(
        document,
        'touchcancel',
        () => {
          this.modifierScrollActive = false;
          this.modifierScrollMode = null;
        },
        { passive: true, capture: true }
      )
    );
  }
}
