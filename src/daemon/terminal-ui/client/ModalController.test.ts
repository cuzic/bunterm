/**
 * ModalController Tests
 *
 * Note: These tests use mock DOM elements since bun:test
 * doesn't have a DOM environment.
 */

import { describe, expect, mock, test } from 'bun:test';
import { createModalController } from './ModalController.js';

// Mock HTMLElement for testing
const createMockElement = () => {
  const classes = new Set<string>(['hidden']);
  const listeners: Record<string, Array<(e: Event) => void>> = {};

  return {
    classList: {
      add: (cls: string) => classes.add(cls),
      remove: (cls: string) => classes.delete(cls),
      contains: (cls: string) => classes.has(cls),
      toggle: (cls: string) => {
        if (classes.has(cls)) {
          classes.delete(cls);
          return false;
        }
        classes.add(cls);
        return true;
      }
    },
    addEventListener: (type: string, handler: EventListener) => {
      if (!listeners[type]) {
        listeners[type] = [];
      }
      listeners[type].push(handler as (e: Event) => void);
    },
    removeEventListener: (type: string, handler: EventListener) => {
      if (listeners[type]) {
        listeners[type] = listeners[type].filter((h) => h !== handler);
      }
    },
    dispatchEvent: (event: Event) => {
      const type = event.type;
      if (listeners[type]) {
        for (const handler of listeners[type]) {
          handler(event);
        }
      }
    },
    _listeners: listeners
  } as unknown as HTMLElement & { _listeners: typeof listeners };
};

describe('ModalController', () => {
  describe('basic operations', () => {
    test('isVisible returns false initially (hidden class present)', () => {
      const modal = createMockElement();
      const controller = createModalController({ modal, escapeClose: false });

      expect(controller.isVisible()).toBe(false);
    });

    test('show removes hidden class', () => {
      const modal = createMockElement();
      const controller = createModalController({ modal, escapeClose: false });

      controller.show();

      expect(controller.isVisible()).toBe(true);
      expect(modal.classList.contains('hidden')).toBe(false);
    });

    test('hide adds hidden class', () => {
      const modal = createMockElement();
      const controller = createModalController({ modal, escapeClose: false });

      controller.show();
      controller.hide();

      expect(controller.isVisible()).toBe(false);
      expect(modal.classList.contains('hidden')).toBe(true);
    });

    test('toggle switches visibility', () => {
      const modal = createMockElement();
      const controller = createModalController({ modal, escapeClose: false });

      controller.toggle();
      expect(controller.isVisible()).toBe(true);

      controller.toggle();
      expect(controller.isVisible()).toBe(false);
    });

    test('toggle with force parameter', () => {
      const modal = createMockElement();
      const controller = createModalController({ modal, escapeClose: false });

      controller.toggle(true);
      expect(controller.isVisible()).toBe(true);

      controller.toggle(true); // Should stay visible
      expect(controller.isVisible()).toBe(true);

      controller.toggle(false);
      expect(controller.isVisible()).toBe(false);
    });
  });

  describe('callbacks', () => {
    test('onShow is called when modal is shown', () => {
      const modal = createMockElement();
      const onShow = mock(() => {});
      const controller = createModalController({ modal, onShow, escapeClose: false });

      controller.show();

      expect(onShow).toHaveBeenCalledTimes(1);
    });

    test('onHide is called when modal is hidden', () => {
      const modal = createMockElement();
      const onHide = mock(() => {});
      const controller = createModalController({ modal, onHide, escapeClose: false });

      controller.show();
      controller.hide();

      expect(onHide).toHaveBeenCalledTimes(1);
    });
  });

  describe('close button', () => {
    test('clicking close button hides modal', () => {
      const modal = createMockElement();
      const closeBtn = createMockElement();
      const controller = createModalController({ modal, closeBtn, escapeClose: false });

      controller.show();

      // Simulate click
      const event = { type: 'click', preventDefault: mock(() => {}) } as unknown as Event;
      closeBtn.dispatchEvent(event);

      expect(controller.isVisible()).toBe(false);
    });
  });

  describe('backdrop click', () => {
    test('clicking backdrop hides modal', () => {
      const modal = createMockElement();
      const controller = createModalController({ modal, backdropClose: true, escapeClose: false });

      controller.show();

      // Simulate click on modal itself (backdrop)
      const event = { type: 'click', target: modal } as unknown as Event;
      modal.dispatchEvent(event);

      expect(controller.isVisible()).toBe(false);
    });

    test('clicking inside modal does not hide it', () => {
      const modal = createMockElement();
      const innerElement = createMockElement();
      const controller = createModalController({ modal, backdropClose: true, escapeClose: false });

      controller.show();

      // Simulate click on inner element
      const event = { type: 'click', target: innerElement } as unknown as Event;
      modal.dispatchEvent(event);

      expect(controller.isVisible()).toBe(true);
    });

    test('backdrop close can be disabled', () => {
      const modal = createMockElement();
      const controller = createModalController({ modal, backdropClose: false, escapeClose: false });

      controller.show();

      const event = { type: 'click', target: modal } as unknown as Event;
      modal.dispatchEvent(event);

      expect(controller.isVisible()).toBe(true);
    });
  });

  describe('destroy', () => {
    test('destroy removes event listeners', () => {
      const modal = createMockElement();
      const closeBtn = createMockElement();
      const controller = createModalController({ modal, closeBtn, escapeClose: false });

      controller.destroy();

      // After destroy, clicking close button should not hide modal
      controller.show();
      const event = { type: 'click', preventDefault: mock(() => {}) } as unknown as Event;
      closeBtn.dispatchEvent(event);

      // Modal should still be visible because listener was removed
      // Note: This test relies on the mock implementation
      expect(modal._listeners['click']?.length ?? 0).toBe(0);
    });
  });
});
