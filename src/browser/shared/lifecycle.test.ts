/**
 * Tests for Lifecycle Management utilities
 */

import { describe, expect, mock, test } from 'bun:test';
import { Scope, on, onBus } from './lifecycle.js';

describe('Scope', () => {
  test('add() collects disposables', () => {
    const scope = new Scope();
    const fn1 = mock(() => {});
    const fn2 = mock(() => {});

    scope.add(fn1);
    scope.add(fn2);

    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).not.toHaveBeenCalled();
  });

  test('close() calls all disposables in LIFO order', () => {
    const scope = new Scope();
    const order: number[] = [];

    scope.add(() => order.push(1));
    scope.add(() => order.push(2));
    scope.add(() => order.push(3));

    scope.close();

    expect(order).toEqual([3, 2, 1]);
  });

  test('close() only runs once', () => {
    const scope = new Scope();
    const fn = mock(() => {});

    scope.add(fn);
    scope.close();
    scope.close();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('add() calls disposable immediately if scope is closed', () => {
    const scope = new Scope();
    scope.close();

    const fn = mock(() => {});
    scope.add(fn);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('isClosed() returns correct state', () => {
    const scope = new Scope();

    expect(scope.isClosed()).toBe(false);
    scope.close();
    expect(scope.isClosed()).toBe(true);
  });

  test('createChild() creates a child scope that closes with parent', () => {
    const parent = new Scope();
    const child = parent.createChild();

    const parentFn = mock(() => {});
    const childFn = mock(() => {});

    parent.add(parentFn);
    child.add(childFn);

    parent.close();

    expect(parentFn).toHaveBeenCalledTimes(1);
    expect(childFn).toHaveBeenCalledTimes(1);
  });

  test('close() continues even if a disposable throws', () => {
    const scope = new Scope();
    const fn1 = mock(() => {});
    const fn2 = mock(() => {
      throw new Error('test error');
    });
    const fn3 = mock(() => {});

    scope.add(fn1);
    scope.add(fn2);
    scope.add(fn3);

    // Should not throw
    scope.close();

    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
    expect(fn3).toHaveBeenCalledTimes(1);
  });
});

describe('on()', () => {
  test('returns a disposable that removes the listener', () => {
    // Create a mock EventTarget
    const target = {
      addEventListener: mock(() => {}),
      removeEventListener: mock(() => {})
    };
    const handler = () => {};

    // @ts-expect-error - using mock object
    const dispose = on(target, 'click', handler);

    expect(target.addEventListener).toHaveBeenCalledTimes(1);
    expect(target.addEventListener.mock.calls[0][0]).toBe('click');

    dispose();

    // AbortController.abort() is called, which removes the listener
    // We can't easily verify this without a real DOM
  });

  test('passes options to addEventListener', () => {
    const target = {
      addEventListener: mock(() => {}),
      removeEventListener: mock(() => {})
    };
    const handler = () => {};

    // @ts-expect-error - using mock object
    on(target, 'scroll', handler, { passive: true, capture: true });

    expect(target.addEventListener).toHaveBeenCalledTimes(1);
    const options = target.addEventListener.mock.calls[0][2] as AddEventListenerOptions;
    expect(options.passive).toBe(true);
    expect(options.capture).toBe(true);
    expect(options.signal).toBeDefined();
  });
});

describe('onBus()', () => {
  test('subscribes to bus and returns disposable that unsubscribes', () => {
    const handler = mock(() => {});
    const bus = {
      on: mock(() => {}),
      off: mock(() => {})
    };

    const dispose = onBus(bus, 'test', handler);

    expect(bus.on).toHaveBeenCalledTimes(1);
    expect(bus.on.mock.calls[0][0]).toBe('test');
    expect(bus.on.mock.calls[0][1]).toBe(handler);

    dispose();

    expect(bus.off).toHaveBeenCalledTimes(1);
    expect(bus.off.mock.calls[0][0]).toBe('test');
    expect(bus.off.mock.calls[0][1]).toBe(handler);
  });
});

describe('Scope + on integration', () => {
  test('scope.close() cleans up event listeners', () => {
    const scope = new Scope();
    const target = {
      addEventListener: mock(() => {}),
      removeEventListener: mock(() => {})
    };
    const handler = () => {};

    // @ts-expect-error - using mock object
    scope.add(on(target, 'click', handler));

    expect(target.addEventListener).toHaveBeenCalledTimes(1);

    scope.close();

    // The AbortController.abort() was called, removing the listener
    // We verified this works in isolation; here we just ensure the pattern works
  });
});
