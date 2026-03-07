/**
 * Toolbar Event Bus Tests (TDD)
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { type ToolbarEventBus, type ToolbarEvents, createToolbarEventBus } from './events.js';

describe('ToolbarEventBus', () => {
  let bus: ToolbarEventBus;

  beforeEach(() => {
    bus = createToolbarEventBus();
  });

  describe('basic event emission', () => {
    test('emits paste:request event', () => {
      const handler = mock(() => undefined);
      bus.on('paste:request', handler);
      bus.emit('paste:request');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('emits text:send event with payload', () => {
      const handler = mock((_text: string) => undefined);
      bus.on('text:send', handler);
      bus.emit('text:send', 'hello world');
      expect(handler).toHaveBeenCalledWith('hello world');
    });

    test('emits modal:open event with modal name', () => {
      const handler = mock((_name: string) => undefined);
      bus.on('modal:open', handler);
      bus.emit('modal:open', 'snippet');
      expect(handler).toHaveBeenCalledWith('snippet');
    });

    test('emits modal:close event with modal name', () => {
      const handler = mock((_name: string) => undefined);
      bus.on('modal:close', handler);
      bus.emit('modal:close', 'preview');
      expect(handler).toHaveBeenCalledWith('preview');
    });

    test('emits notification:bell event', () => {
      const handler = mock(() => undefined);
      bus.on('notification:bell', handler);
      bus.emit('notification:bell');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('emits clipboard:copy event with text', () => {
      const handler = mock((_text: string) => undefined);
      bus.on('clipboard:copy', handler);
      bus.emit('clipboard:copy', 'copied text');
      expect(handler).toHaveBeenCalledWith('copied text');
    });

    test('emits terminal_ui:toggle event', () => {
      const handler = mock(() => undefined);
      bus.on('terminal_ui:toggle', handler);
      bus.emit('terminal_ui:toggle');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('emits search:toggle event', () => {
      const handler = mock(() => undefined);
      bus.on('search:toggle', handler);
      bus.emit('search:toggle');
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('multiple listeners', () => {
    test('calls all registered handlers', () => {
      const handler1 = mock(() => undefined);
      const handler2 = mock(() => undefined);
      bus.on('paste:request', handler1);
      bus.on('paste:request', handler2);
      bus.emit('paste:request');
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('unsubscribe', () => {
    test('off removes specific handler', () => {
      const handler = mock(() => undefined);
      bus.on('paste:request', handler);
      bus.off('paste:request', handler);
      bus.emit('paste:request');
      expect(handler).not.toHaveBeenCalled();
    });

    test('returns unsubscribe function from on()', () => {
      const handler = mock(() => undefined);
      const unsubscribe = bus.on('paste:request', handler);
      unsubscribe();
      bus.emit('paste:request');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('wildcard listener', () => {
    test('* handler receives all events', () => {
      const handler = mock((_type: keyof ToolbarEvents, _event?: unknown) => undefined);
      bus.on('*', handler);
      bus.emit('paste:request');
      bus.emit('text:send', 'hello');
      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenCalledWith('paste:request', undefined);
      expect(handler).toHaveBeenCalledWith('text:send', 'hello');
    });
  });

  describe('type safety', () => {
    test('font:change event carries number payload', () => {
      const handler = mock((_size: number) => undefined);
      bus.on('font:change', handler);
      bus.emit('font:change', 16);
      expect(handler).toHaveBeenCalledWith(16);
    });

    test('upload:progress event carries progress info', () => {
      const handler = mock((_progress: { current: number; total: number }) => undefined);
      bus.on('upload:progress', handler);
      bus.emit('upload:progress', { current: 5, total: 10 });
      expect(handler).toHaveBeenCalledWith({ current: 5, total: 10 });
    });

    test('upload:complete event carries paths array', () => {
      const handler = mock((_paths: string[]) => undefined);
      bus.on('upload:complete', handler);
      bus.emit('upload:complete', ['file1.png', 'file2.png']);
      expect(handler).toHaveBeenCalledWith(['file1.png', 'file2.png']);
    });

    test('error event carries Error object', () => {
      const handler = mock((_error: Error) => undefined);
      bus.on('error', handler);
      const err = new Error('test error');
      bus.emit('error', err);
      expect(handler).toHaveBeenCalledWith(err);
    });
  });
});
