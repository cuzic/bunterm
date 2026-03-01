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
import type { TerminalUiConfig } from './types.js';

const SCROLL_THRESHOLD = 30; // Pixels to drag before triggering scroll
const EDGE_SWIPE_THRESHOLD = 30; // Pixels from edge to start swipe detection
const SWIPE_HORIZONTAL_THRESHOLD = 100; // Minimum horizontal distance for swipe
const SWIPE_VERTICAL_LIMIT = 50; // Maximum vertical distance for swipe
const ALT_SCROLL_THRESHOLD = 30; // Pixels to drag for one wheel tick

export class TouchGestureHandler {
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

  // Alt+swipe scroll state
  private altScrollActive = false;
  private altScrollLastY = 0;

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
   * Setup all touch event handlers
   */
  setup(): void {
    this.setupShiftMouseInjection();
    this.setupTouchSelection();
    this.setupPinchZoom();
    this.setupWheelZoom();
    this.setupDoubleTap();
    this.setupEdgeSwipe();
    this.setupAltScroll();
  }

  /**
   * Inject shiftKey into mouse events when Shift button is active
   */
  private setupShiftMouseInjection(): void {
    const eventTypes: ('mousedown' | 'mousemove' | 'mouseup')[] = [
      'mousedown',
      'mousemove',
      'mouseup'
    ];

    for (const eventType of eventTypes) {
      document.addEventListener(
        eventType,
        (e: MouseEvent) => {
          // Don't interfere with toolbar buttons
          if (
            (e.target as HTMLElement).closest('#tui') ||
            (e.target as HTMLElement).closest('#tui-toggle')
          ) {
            return;
          }

          if (this.modifiers.isShiftActive() && !e.shiftKey) {
            const newEvent = new MouseEvent(e.type, {
              bubbles: e.bubbles,
              cancelable: e.cancelable,
              view: e.view,
              detail: e.detail,
              screenX: e.screenX,
              screenY: e.screenY,
              clientX: e.clientX,
              clientY: e.clientY,
              ctrlKey: e.ctrlKey,
              altKey: e.altKey,
              shiftKey: true,
              metaKey: e.metaKey,
              button: e.button,
              buttons: e.buttons,
              relatedTarget: e.relatedTarget
            });
            e.stopImmediatePropagation();
            e.preventDefault();
            (e.target as HTMLElement).dispatchEvent(newEvent);
          }
        },
        true
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
  private setupTouchSelection(): void {
    document.addEventListener(
      'touchstart',
      (e: TouchEvent) => {
        const target = e.target as HTMLElement;

        // Don't interfere with toolbar buttons
        if (target.closest('#tui') || target.closest('#tui-toggle')) {
          return;
        }

        // Single finger touch with Scroll active -> enable scroll drag mode
        if (e.touches.length === 1 && this.scrollActive) {
          const touch = e.touches[0];
          this.touchStartPos = { x: touch.clientX, y: touch.clientY };
          this.scrollLastY = touch.clientY;
          this.scrollTouchActive = true;
          e.preventDefault();
        }
        // Single finger touch with Shift active -> convert to mouse event for selection
        else if (e.touches.length === 1 && this.modifiers.isShiftActive()) {
          const touch = e.touches[0];
          this.touchStartPos = { x: touch.clientX, y: touch.clientY };
          this.shiftTouchActive = true;
          e.preventDefault();
          this.dispatchMouseEvent('mousedown', touch, true);
        }
        // 2nd finger added -> cancel Shift/Scroll mode, allow pinch
        else if (e.touches.length === 2 && (this.shiftTouchActive || this.scrollTouchActive)) {
          if (this.shiftTouchActive) {
            this.dispatchMouseEvent('mouseup', e.touches[0], true);
          }
          this.shiftTouchActive = false;
          this.scrollTouchActive = false;
          this.touchStartPos = null;
          // Don't preventDefault - let pinch handlers take over
        }
        // Track non-Shift/Scroll single touch for hint
        else if (e.touches.length === 1 && !this.modifiers.isShiftActive() && !this.scrollActive) {
          const touch = e.touches[0];
          this.touchStartPos = { x: touch.clientX, y: touch.clientY };
        }
      },
      { passive: false, capture: true }
    );

    document.addEventListener(
      'touchmove',
      (e: TouchEvent) => {
        // Handle scroll drag mode
        if (e.touches.length === 1 && this.scrollTouchActive) {
          e.preventDefault();
          const touch = e.touches[0];
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
        else if (e.touches.length === 1 && this.shiftTouchActive) {
          e.preventDefault();
          this.dispatchMouseEvent('mousemove', e.touches[0], true);
        }
        // Don't interfere with 2-finger gestures (pinch)
      },
      { passive: false, capture: true }
    );

    document.addEventListener(
      'touchend',
      (e: TouchEvent) => {
        // Scroll mode ending
        if (this.scrollTouchActive && e.touches.length === 0) {
          this.scrollTouchActive = false;
          this.touchStartPos = null;
        }
        // Shift selection mode ending
        else if (this.shiftTouchActive && e.touches.length === 0) {
          const touch = e.changedTouches[0];
          this.dispatchMouseEvent('mouseup', touch, true);
          this.shiftTouchActive = false;
          this.touchStartPos = null;
        }
      },
      { passive: true, capture: true }
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
   */
  private setupPinchZoom(): void {
    document.addEventListener(
      'touchstart',
      (e: TouchEvent) => {
        if (
          e.touches.length === 2 &&
          (this.modifiers.isCtrlActive() || this.modifiers.isShiftActive())
        ) {
          this.pinchStartDistance = this.getTouchDistance(e.touches);
          this.pinchStartFontSize = this.terminal.getCurrentFontSize();
        }
      },
      { passive: true }
    );

    document.addEventListener(
      'touchmove',
      (e: TouchEvent) => {
        if (
          e.touches.length === 2 &&
          (this.modifiers.isCtrlActive() || this.modifiers.isShiftActive()) &&
          this.pinchStartDistance > 0
        ) {
          e.preventDefault(); // Suppress browser zoom
          const currentDistance = this.getTouchDistance(e.touches);
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
    );

    document.addEventListener(
      'touchend',
      (e: TouchEvent) => {
        if (e.touches.length < 2 && this.pinchStartDistance > 0) {
          // Pinch gesture completed - emit font change event
          toolbarEvents.emit('font:change', this.terminal.getCurrentFontSize());
          this.pinchStartDistance = 0;
        }
      },
      { passive: true }
    );
  }

  /**
   * Setup Ctrl+Wheel / Trackpad pinch zoom
   */
  private setupWheelZoom(): void {
    document.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        // Skip events targeting preview pane (let iframe handle its own scrolling)
        const target = e.target as HTMLElement;
        if (target.closest('#tui-preview-pane')) {
          return;
        }

        // ctrlKey = trackpad pinch (Mac) or Ctrl+scroll (PC)
        if (e.ctrlKey) {
          e.preventDefault(); // Suppress browser zoom

          // deltaY > 0: zoom out, deltaY < 0: zoom in
          const delta = e.deltaY > 0 ? -2 : 2;
          if (this.terminal.zoomTerminal(delta)) {
            toolbarEvents.emit('font:change', this.terminal.getCurrentFontSize());
          }
        }
      },
      { passive: false }
    );
  }

  /**
   * Setup double-tap to send Enter
   */
  private setupDoubleTap(): void {
    document.addEventListener(
      'touchend',
      (e: TouchEvent) => {
        const target = e.target as HTMLElement;

        // Exclude toolbar elements
        if (target.closest('#tui') || target.closest('#tui-toggle')) {
          return;
        }

        // Single touch only
        if (e.changedTouches.length !== 1) {
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
    );
  }

  /**
   * Setup edge swipe from right to open session switcher
   * Detection: Touch starts within 30px of right edge, swipe left 100px+ with <50px vertical movement
   */
  private setupEdgeSwipe(): void {
    document.addEventListener(
      'touchstart',
      (e: TouchEvent) => {
        const target = e.target as HTMLElement;

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

        if (e.touches.length === 1) {
          const touch = e.touches[0];
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
    );

    document.addEventListener(
      'touchend',
      (e: TouchEvent) => {
        if (!this.edgeSwipeStartedFromEdge) {
          return;
        }

        if (e.changedTouches.length === 1) {
          const touch = e.changedTouches[0];
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
    );
  }

  /**
   * Setup Alt+swipe scroll gesture
   * When Alt is active, vertical swipe sends mouse wheel events
   */
  private setupAltScroll(): void {
    document.addEventListener(
      'touchstart',
      (e: TouchEvent) => {
        const target = e.target as HTMLElement;

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

        // Single finger touch with Alt active -> enable alt scroll mode
        if (e.touches.length === 1 && this.modifiers.isAltActive()) {
          this.altScrollActive = true;
          this.altScrollLastY = e.touches[0].clientY;
          e.preventDefault();
        }
      },
      { passive: false, capture: true }
    );

    document.addEventListener(
      'touchmove',
      (e: TouchEvent) => {
        if (!this.altScrollActive || e.touches.length !== 1) {
          return;
        }

        const touch = e.touches[0];
        const deltaY = this.altScrollLastY - touch.clientY;

        if (Math.abs(deltaY) >= ALT_SCROLL_THRESHOLD) {
          const ticks = Math.floor(Math.abs(deltaY) / ALT_SCROLL_THRESHOLD);
          const direction = deltaY > 0 ? 'down' : 'up';
          this.input.sendWheel(direction, ticks);
          this.altScrollLastY = touch.clientY;
        }
        e.preventDefault();
      },
      { passive: false, capture: true }
    );

    document.addEventListener(
      'touchend',
      () => {
        this.altScrollActive = false;
      },
      { passive: true, capture: true }
    );

    document.addEventListener(
      'touchcancel',
      () => {
        this.altScrollActive = false;
      },
      { passive: true, capture: true }
    );
  }
}
