/**
 * LayoutManager Tests
 *
 * Tests for viewport and toolbar height calculations across various scenarios:
 * - Toolbar visible/hidden
 * - Mobile keyboard visible/hidden (simulated via visualViewport)
 * - State transitions
 * - Device-specific scenarios
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';

// Mock DOM environment
const mockToolbarEl = {
  classList: {
    contains: mock(() => false)
  },
  getBoundingClientRect: mock(() => ({ height: 100 }))
};

const mockVisualViewport = {
  height: 800,
  offsetTop: 0,
  addEventListener: mock(() => {}),
  removeEventListener: mock(() => {})
};

const mockResizeObserver = mock(() => ({
  observe: mock(() => {}),
  disconnect: mock(() => {})
}));

// Setup global mocks
(globalThis as unknown as Record<string, unknown>).window = {
  visualViewport: mockVisualViewport,
  innerHeight: 800,
  addEventListener: mock(() => {}),
  removeEventListener: mock(() => {})
};

(globalThis as unknown as Record<string, unknown>).document = {
  documentElement: {
    style: {
      setProperty: mock(() => {})
    }
  },
  body: {
    offsetHeight: 800 // Used for forced reflow
  }
};

(globalThis as unknown as Record<string, unknown>).requestAnimationFrame = mock(
  (cb: () => void) => {
    cb();
    return 1;
  }
);
(globalThis as unknown as Record<string, unknown>).cancelAnimationFrame = mock(() => {});
(globalThis as unknown as Record<string, unknown>).ResizeObserver = mockResizeObserver;

// Import after mocks are set up
import { LayoutManager } from './LayoutManager.js';
import { Scope } from './lifecycle.js';

/** Helper to get last CSS variable value */
function getLastCssValue(varName: string): string | undefined {
  const setProperty = document.documentElement.style.setProperty as ReturnType<typeof mock>;
  const calls = setProperty.mock.calls as string[][];
  const lastCall = calls.filter((c) => c[0] === varName).pop();
  return lastCall?.[1];
}

/** Helper to calculate expected terminal height */
function expectedTerminalHeight(vvh: number, tuiH: number): number {
  return vvh - tuiH;
}

describe('LayoutManager', () => {
  let layoutManager: LayoutManager;
  let fitFnMock: ReturnType<typeof mock>;
  let scope: Scope;

  beforeEach(() => {
    fitFnMock = mock(() => {});
    layoutManager = new LayoutManager(mockToolbarEl as unknown as HTMLElement, fitFnMock);
    scope = new Scope();

    // Reset mocks
    mockToolbarEl.classList.contains = mock(() => false);
    mockToolbarEl.getBoundingClientRect = mock(() => ({ height: 100 }));
    mockVisualViewport.height = 800;
    mockVisualViewport.offsetTop = 0;
    (document.documentElement.style.setProperty as ReturnType<typeof mock>).mockClear();
    fitFnMock.mockClear();
  });

  describe('Toolbar visible scenarios', () => {
    test('sets correct CSS variables with toolbar visible', () => {
      mockToolbarEl.classList.contains = mock(() => false); // not hidden
      mockToolbarEl.getBoundingClientRect = mock(() => ({ height: 100 }));
      mockVisualViewport.height = 800;

      layoutManager.forceUpdate();

      expect(getLastCssValue('--vvh')).toBe('800px');
      expect(getLastCssValue('--tui-h')).toBe('100px');
      expect(fitFnMock).toHaveBeenCalled();
    });

    test('handles minimized toolbar (smaller height)', () => {
      mockToolbarEl.classList.contains = mock(() => false);
      mockToolbarEl.getBoundingClientRect = mock(() => ({ height: 40 })); // minimized

      layoutManager.forceUpdate();

      expect(getLastCssValue('--tui-h')).toBe('40px');
    });

    test('handles buttons-collapsed toolbar', () => {
      mockToolbarEl.classList.contains = mock(() => false);
      mockToolbarEl.getBoundingClientRect = mock(() => ({ height: 60 })); // collapsed buttons

      layoutManager.forceUpdate();

      expect(getLastCssValue('--tui-h')).toBe('60px');
    });

    test('handles tall toolbar with wrapped buttons', () => {
      mockToolbarEl.classList.contains = mock(() => false);
      mockToolbarEl.getBoundingClientRect = mock(() => ({ height: 180 })); // wrapped buttons

      layoutManager.forceUpdate();

      expect(getLastCssValue('--tui-h')).toBe('180px');
    });
  });

  describe('Toolbar hidden scenarios', () => {
    test('sets toolbar height to 0 when hidden', () => {
      mockToolbarEl.classList.contains = mock(() => true); // hidden

      layoutManager.forceUpdate();

      expect(getLastCssValue('--tui-h')).toBe('0px');
    });

    test('still sets viewport height when toolbar hidden', () => {
      mockToolbarEl.classList.contains = mock(() => true);
      mockVisualViewport.height = 800;

      layoutManager.forceUpdate();

      expect(getLastCssValue('--vvh')).toBe('800px');
    });

    test('calls fitFn when toolbar hidden', () => {
      mockToolbarEl.classList.contains = mock(() => true);

      layoutManager.forceUpdate();

      expect(fitFnMock).toHaveBeenCalled();
    });
  });

  describe('Mobile keyboard scenarios (visualViewport)', () => {
    test('reduces viewport height when keyboard shown', () => {
      mockToolbarEl.classList.contains = mock(() => false);
      mockVisualViewport.height = 400; // keyboard takes half screen

      layoutManager.forceUpdate();

      expect(getLastCssValue('--vvh')).toBe('400px');
    });

    test('handles keyboard with toolbar visible', () => {
      mockToolbarEl.classList.contains = mock(() => false);
      mockToolbarEl.getBoundingClientRect = mock(() => ({ height: 100 }));
      mockVisualViewport.height = 400; // keyboard shown

      layoutManager.forceUpdate();

      expect(getLastCssValue('--vvh')).toBe('400px');
      expect(getLastCssValue('--tui-h')).toBe('100px');
      // Terminal height via CSS: 400 - 100 = 300px
      expect(expectedTerminalHeight(400, 100)).toBe(300);
    });

    test('handles keyboard with toolbar hidden', () => {
      mockToolbarEl.classList.contains = mock(() => true); // hidden
      mockVisualViewport.height = 400; // keyboard shown

      layoutManager.forceUpdate();

      expect(getLastCssValue('--vvh')).toBe('400px');
      expect(getLastCssValue('--tui-h')).toBe('0px');
      // Terminal height via CSS: 400px (full viewport)
      expect(expectedTerminalHeight(400, 0)).toBe(400);
    });

    test('sets viewport offset for iOS keyboard push', () => {
      mockVisualViewport.offsetTop = 50; // iOS pushes viewport up

      layoutManager.forceUpdate();

      expect(getLastCssValue('--vv-offset-top')).toBe('50px');
    });

    test('restores full height when keyboard dismissed', () => {
      // First, keyboard shown
      mockVisualViewport.height = 400;
      layoutManager.forceUpdate();

      // Then keyboard dismissed
      mockVisualViewport.height = 800;
      layoutManager.forceUpdate();

      expect(getLastCssValue('--vvh')).toBe('800px');
    });

    test('handles very small keyboard height (accessory bar only)', () => {
      mockVisualViewport.height = 750; // small reduction for accessory bar

      layoutManager.forceUpdate();

      expect(getLastCssValue('--vvh')).toBe('750px');
    });

    test('handles large keyboard (tablet with suggestions)', () => {
      mockVisualViewport.height = 300; // large keyboard with suggestions

      layoutManager.forceUpdate();

      expect(getLastCssValue('--vvh')).toBe('300px');
    });
  });

  describe('State transition scenarios', () => {
    test('toolbar visible → hidden', () => {
      // Initial: toolbar visible
      mockToolbarEl.classList.contains = mock(() => false);
      mockToolbarEl.getBoundingClientRect = mock(() => ({ height: 100 }));
      layoutManager.forceUpdate();

      expect(getLastCssValue('--tui-h')).toBe('100px');

      // Transition: hide toolbar
      mockToolbarEl.classList.contains = mock(() => true);
      layoutManager.forceUpdate();

      expect(getLastCssValue('--tui-h')).toBe('0px');
    });

    test('toolbar hidden → visible', () => {
      // Initial: toolbar hidden
      mockToolbarEl.classList.contains = mock(() => true);
      layoutManager.forceUpdate();

      expect(getLastCssValue('--tui-h')).toBe('0px');

      // Transition: show toolbar
      mockToolbarEl.classList.contains = mock(() => false);
      mockToolbarEl.getBoundingClientRect = mock(() => ({ height: 100 }));
      layoutManager.forceUpdate();

      expect(getLastCssValue('--tui-h')).toBe('100px');
    });

    test('keyboard show → hide with toolbar visible', () => {
      mockToolbarEl.classList.contains = mock(() => false);
      mockToolbarEl.getBoundingClientRect = mock(() => ({ height: 100 }));

      // Show keyboard
      mockVisualViewport.height = 400;
      layoutManager.forceUpdate();
      expect(expectedTerminalHeight(400, 100)).toBe(300);

      // Hide keyboard
      mockVisualViewport.height = 800;
      layoutManager.forceUpdate();
      expect(expectedTerminalHeight(800, 100)).toBe(700);
    });

    test('keyboard show → hide with toolbar hidden', () => {
      mockToolbarEl.classList.contains = mock(() => true);

      // Show keyboard
      mockVisualViewport.height = 400;
      layoutManager.forceUpdate();
      expect(expectedTerminalHeight(400, 0)).toBe(400);

      // Hide keyboard
      mockVisualViewport.height = 800;
      layoutManager.forceUpdate();
      expect(expectedTerminalHeight(800, 0)).toBe(800);
    });

    test('toolbar visible + keyboard hidden → toolbar hidden + keyboard shown', () => {
      mockToolbarEl.classList.contains = mock(() => false);
      mockToolbarEl.getBoundingClientRect = mock(() => ({ height: 100 }));
      mockVisualViewport.height = 800;
      layoutManager.forceUpdate();

      // Terminal: 800 - 100 = 700px
      expect(expectedTerminalHeight(800, 100)).toBe(700);

      // Hide toolbar, show keyboard
      mockToolbarEl.classList.contains = mock(() => true);
      mockVisualViewport.height = 400;
      layoutManager.forceUpdate();

      // Terminal: 400px (full visible viewport)
      expect(getLastCssValue('--vvh')).toBe('400px');
      expect(getLastCssValue('--tui-h')).toBe('0px');
    });

    test('toolbar hidden + keyboard shown → toolbar visible + keyboard hidden', () => {
      mockToolbarEl.classList.contains = mock(() => true);
      mockVisualViewport.height = 400;
      layoutManager.forceUpdate();

      // Show toolbar, hide keyboard
      mockToolbarEl.classList.contains = mock(() => false);
      mockToolbarEl.getBoundingClientRect = mock(() => ({ height: 100 }));
      mockVisualViewport.height = 800;
      layoutManager.forceUpdate();

      expect(getLastCssValue('--vvh')).toBe('800px');
      expect(getLastCssValue('--tui-h')).toBe('100px');
    });

    test('toolbar minimize while keyboard shown', () => {
      mockToolbarEl.classList.contains = mock(() => false);
      mockToolbarEl.getBoundingClientRect = mock(() => ({ height: 100 }));
      mockVisualViewport.height = 400;
      layoutManager.forceUpdate();

      // Minimize toolbar
      mockToolbarEl.getBoundingClientRect = mock(() => ({ height: 40 }));
      layoutManager.forceUpdate();

      expect(getLastCssValue('--tui-h')).toBe('40px');
      // Terminal: 400 - 40 = 360px
      expect(expectedTerminalHeight(400, 40)).toBe(360);
    });

    test('rapid toolbar toggle', () => {
      mockToolbarEl.getBoundingClientRect = mock(() => ({ height: 100 }));

      // Rapid toggles
      mockToolbarEl.classList.contains = mock(() => false);
      layoutManager.forceUpdate();
      mockToolbarEl.classList.contains = mock(() => true);
      layoutManager.forceUpdate();
      mockToolbarEl.classList.contains = mock(() => false);
      layoutManager.forceUpdate();
      mockToolbarEl.classList.contains = mock(() => true);
      layoutManager.forceUpdate();

      // Final state: hidden
      expect(getLastCssValue('--tui-h')).toBe('0px');
    });
  });

  describe('Device-specific scenarios', () => {
    describe('iPhone (small screen)', () => {
      test('portrait mode with keyboard', () => {
        mockVisualViewport.height = 300; // iPhone SE portrait with keyboard
        mockToolbarEl.classList.contains = mock(() => false);
        mockToolbarEl.getBoundingClientRect = mock(() => ({ height: 100 }));

        layoutManager.forceUpdate();

        expect(getLastCssValue('--vvh')).toBe('300px');
        // Terminal: 300 - 100 = 200px (still usable)
        expect(expectedTerminalHeight(300, 100)).toBe(200);
      });

      test('landscape mode with keyboard', () => {
        mockVisualViewport.height = 150; // very constrained
        mockToolbarEl.classList.contains = mock(() => false);
        mockToolbarEl.getBoundingClientRect = mock(() => ({ height: 40 })); // minimized

        layoutManager.forceUpdate();

        expect(expectedTerminalHeight(150, 40)).toBe(110);
      });
    });

    describe('iPad (large screen)', () => {
      test('split keyboard mode', () => {
        mockVisualViewport.height = 600; // split keyboard takes less space
        mockToolbarEl.classList.contains = mock(() => false);
        mockToolbarEl.getBoundingClientRect = mock(() => ({ height: 100 }));

        layoutManager.forceUpdate();

        expect(expectedTerminalHeight(600, 100)).toBe(500);
      });

      test('floating keyboard mode', () => {
        mockVisualViewport.height = 800; // floating keyboard doesn't reduce viewport
        mockToolbarEl.classList.contains = mock(() => false);
        mockToolbarEl.getBoundingClientRect = mock(() => ({ height: 100 }));

        layoutManager.forceUpdate();

        expect(expectedTerminalHeight(800, 100)).toBe(700);
      });
    });

    describe('Android', () => {
      test('with navigation bar', () => {
        mockVisualViewport.height = 380; // keyboard + nav bar
        mockToolbarEl.classList.contains = mock(() => false);
        mockToolbarEl.getBoundingClientRect = mock(() => ({ height: 100 }));

        layoutManager.forceUpdate();

        expect(expectedTerminalHeight(380, 100)).toBe(280);
      });

      test('fullscreen mode', () => {
        mockVisualViewport.height = 420; // keyboard only, no nav bar
        mockToolbarEl.classList.contains = mock(() => false);
        mockToolbarEl.getBoundingClientRect = mock(() => ({ height: 100 }));

        layoutManager.forceUpdate();

        expect(expectedTerminalHeight(420, 100)).toBe(320);
      });
    });
  });

  describe('Edge cases', () => {
    test('handles zero viewport height', () => {
      mockVisualViewport.height = 0;

      layoutManager.forceUpdate();

      expect(getLastCssValue('--vvh')).toBe('0px');
    });

    test('handles negative toolbar height (should not happen)', () => {
      mockToolbarEl.getBoundingClientRect = mock(() => ({ height: -10 }));

      layoutManager.forceUpdate();

      // Should round to 0 or use absolute value
      const tuiH = getLastCssValue('--tui-h');
      expect(Number.parseInt(tuiH || '0')).toBeLessThanOrEqual(0);
    });

    test('handles fractional heights', () => {
      mockVisualViewport.height = 799.5;
      mockToolbarEl.getBoundingClientRect = mock(() => ({ height: 99.7 }));

      layoutManager.forceUpdate();

      // Should round to integers
      expect(getLastCssValue('--vvh')).toBe('800px');
      expect(getLastCssValue('--tui-h')).toBe('100px');
    });

    test('handles very large viewport', () => {
      mockVisualViewport.height = 2000; // large monitor

      layoutManager.forceUpdate();

      expect(getLastCssValue('--vvh')).toBe('2000px');
    });
  });

  describe('Lifecycle', () => {
    test('mount registers event listeners', () => {
      layoutManager.mount(scope);

      // Should have called visualViewport.addEventListener
      expect(mockVisualViewport.addEventListener).toHaveBeenCalled();
    });

    test('scope.close removes event listeners', () => {
      layoutManager.mount(scope);
      scope.close();

      // Should have called visualViewport.removeEventListener
      expect(mockVisualViewport.removeEventListener).toHaveBeenCalled();
    });

    test('does not update after disposed', () => {
      layoutManager.mount(scope);
      scope.close();

      (document.documentElement.style.setProperty as ReturnType<typeof mock>).mockClear();
      layoutManager.forceUpdate();

      // Should not have called setProperty after dispose
      expect(document.documentElement.style.setProperty).not.toHaveBeenCalled();
    });

    test('scheduleUpdate does not run after disposed', () => {
      layoutManager.mount(scope);
      scope.close();

      (document.documentElement.style.setProperty as ReturnType<typeof mock>).mockClear();
      layoutManager.scheduleUpdate();

      expect(document.documentElement.style.setProperty).not.toHaveBeenCalled();
    });
  });

  describe('Fallback behavior', () => {
    test('uses innerHeight when visualViewport not available', () => {
      // Temporarily remove visualViewport
      const originalVV = (window as unknown as Record<string, unknown>).visualViewport;
      (window as unknown as Record<string, unknown>).visualViewport = undefined;
      (window as unknown as Record<string, unknown>).innerHeight = 600;

      const manager = new LayoutManager(mockToolbarEl as unknown as HTMLElement, fitFnMock);
      manager.forceUpdate();

      expect(getLastCssValue('--vvh')).toBe('600px');

      // Restore
      (window as unknown as Record<string, unknown>).visualViewport = originalVV;
    });

    test('uses 0 for offsetTop when visualViewport not available', () => {
      const originalVV = (window as unknown as Record<string, unknown>).visualViewport;
      (window as unknown as Record<string, unknown>).visualViewport = undefined;

      const manager = new LayoutManager(mockToolbarEl as unknown as HTMLElement, fitFnMock);
      manager.forceUpdate();

      expect(getLastCssValue('--vv-offset-top')).toBe('0px');

      (window as unknown as Record<string, unknown>).visualViewport = originalVV;
    });
  });

  describe('Debouncing', () => {
    test('scheduleUpdate uses requestAnimationFrame', () => {
      const rafMock = globalThis.requestAnimationFrame as ReturnType<typeof mock>;
      rafMock.mockClear();

      layoutManager.scheduleUpdate();

      expect(rafMock).toHaveBeenCalled();
    });

    test('multiple scheduleUpdate calls are debounced', () => {
      const rafMock = globalThis.requestAnimationFrame as ReturnType<typeof mock>;
      const cancelRafMock = globalThis.cancelAnimationFrame as ReturnType<typeof mock>;
      cancelRafMock.mockClear();

      layoutManager.scheduleUpdate();
      layoutManager.scheduleUpdate();
      layoutManager.scheduleUpdate();

      // Should have cancelled previous RAF calls
      expect(cancelRafMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    test('forceUpdate bypasses debouncing', () => {
      const cancelRafMock = globalThis.cancelAnimationFrame as ReturnType<typeof mock>;
      cancelRafMock.mockClear();

      // Schedule an update
      layoutManager.scheduleUpdate();

      // Force update should cancel pending and update immediately
      layoutManager.forceUpdate();

      expect(cancelRafMock).toHaveBeenCalled();
      expect(fitFnMock).toHaveBeenCalled();
    });
  });

  describe('fitFn callback', () => {
    test('fitFn is called on every update', () => {
      layoutManager.forceUpdate();
      layoutManager.forceUpdate();
      layoutManager.forceUpdate();

      expect(fitFnMock.mock.calls.length).toBe(3);
    });

    test('fitFn is called after CSS variables are set', () => {
      let cssSetBeforeFit = false;
      const customFitFn = mock(() => {
        // Check if CSS variables were set before fitFn was called
        const setProperty = document.documentElement.style.setProperty as ReturnType<typeof mock>;
        cssSetBeforeFit = setProperty.mock.calls.length > 0;
      });

      const manager = new LayoutManager(mockToolbarEl as unknown as HTMLElement, customFitFn);
      manager.forceUpdate();

      expect(cssSetBeforeFit).toBe(true);
    });
  });

  describe('CSS variable values', () => {
    test('all three CSS variables are set on each update', () => {
      layoutManager.forceUpdate();

      expect(getLastCssValue('--vvh')).toBeDefined();
      expect(getLastCssValue('--tui-h')).toBeDefined();
      expect(getLastCssValue('--vv-offset-top')).toBeDefined();
    });

    test('CSS variables have correct format (number + px)', () => {
      layoutManager.forceUpdate();

      const vvh = getLastCssValue('--vvh');
      const tuiH = getLastCssValue('--tui-h');
      const offset = getLastCssValue('--vv-offset-top');

      expect(vvh).toMatch(/^\d+px$/);
      expect(tuiH).toMatch(/^\d+px$/);
      expect(offset).toMatch(/^\d+px$/);
    });
  });
});
