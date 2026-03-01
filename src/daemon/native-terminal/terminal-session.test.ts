/**
 * Tests for TerminalSession
 *
 * Note: Some tests require actual PTY support (POSIX only).
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { TerminalSession } from './terminal-session.js';
import type { NativeTerminalWebSocket } from './types.js';

// Mock WebSocket for testing
function createMockWebSocket(): NativeTerminalWebSocket & { sentMessages: string[]; closed: boolean } {
  const ws = {
    sentMessages: [] as string[],
    closed: false,
    data: { sessionName: 'test-session' },
    send(data: string) {
      this.sentMessages.push(data);
    },
    close() {
      this.closed = true;
    },
  };
  return ws as NativeTerminalWebSocket & { sentMessages: string[]; closed: boolean };
}

// Integration tests that require real PTY support
const hasPtySupport = process.platform !== 'win32';

describe.skipIf(!hasPtySupport)('TerminalSession with real PTY', () => {
  let session: TerminalSession;

  afterEach(async () => {
    if (session) {
      await session.stop();
    }
  });

  test('creates session with default options', () => {
    session = new TerminalSession({
      name: 'test-session',
      command: ['echo', 'hello'],
      cwd: process.cwd(),
    });

    expect(session.name).toBe('test-session');
    expect(session.cwd).toBe(process.cwd());
    expect(session.command).toEqual(['echo', 'hello']);
  });

  test('creates session with custom options', () => {
    session = new TerminalSession({
      name: 'custom-session',
      command: ['cat'],
      cwd: '/tmp',
      cols: 120,
      rows: 40,
      outputBufferSize: 500,
    });

    const info = session.getInfo();
    expect(info.cols).toBe(120);
    expect(info.rows).toBe(40);
  });

  test('start throws if already running', async () => {
    session = new TerminalSession({
      name: 'double-start',
      command: ['cat'],
      cwd: process.cwd(),
    });

    await session.start();

    await expect(session.start()).rejects.toThrow('Session double-start is already running');
  });

  test('isRunning reflects session state', async () => {
    session = new TerminalSession({
      name: 'running-check',
      command: ['cat'],
      cwd: process.cwd(),
    });

    expect(session.isRunning).toBe(false);

    await session.start();
    expect(session.isRunning).toBe(true);

    await session.stop();
    expect(session.isRunning).toBe(false);
  });

  test('getInfo returns session information', async () => {
    session = new TerminalSession({
      name: 'info-session',
      command: ['cat'],
      cwd: process.cwd(),
      cols: 100,
      rows: 30,
    });

    await session.start();

    const info = session.getInfo();
    expect(info.name).toBe('info-session');
    expect(info.cwd).toBe(process.cwd());
    expect(info.cols).toBe(100);
    expect(info.rows).toBe(30);
    expect(info.pid).toBeGreaterThan(0);
    expect(info.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('client management works correctly', async () => {
    session = new TerminalSession({
      name: 'client-test',
      command: ['cat'],
      cwd: process.cwd(),
    });

    await session.start();

    const ws1 = createMockWebSocket();
    const ws2 = createMockWebSocket();

    expect(session.clientCount).toBe(0);

    session.addClient(ws1);
    expect(session.clientCount).toBe(1);

    session.addClient(ws2);
    expect(session.clientCount).toBe(2);

    session.removeClient(ws1);
    expect(session.clientCount).toBe(1);

    session.removeClient(ws2);
    expect(session.clientCount).toBe(0);
  });

  test('handleMessage responds to ping with pong', async () => {
    session = new TerminalSession({
      name: 'ping-test',
      command: ['cat'],
      cwd: process.cwd(),
    });

    await session.start();

    const ws = createMockWebSocket();
    session.handleMessage(ws, JSON.stringify({ type: 'ping' }));

    expect(ws.sentMessages).toHaveLength(1);
    const response = JSON.parse(ws.sentMessages[0]);
    expect(response.type).toBe('pong');
  });

  test('handleMessage sends error for invalid message', async () => {
    session = new TerminalSession({
      name: 'error-test',
      command: ['cat'],
      cwd: process.cwd(),
    });

    await session.start();

    const ws = createMockWebSocket();
    session.handleMessage(ws, 'invalid json');

    expect(ws.sentMessages).toHaveLength(1);
    const response = JSON.parse(ws.sentMessages[0]);
    expect(response.type).toBe('error');
  });

  test('output buffer management', async () => {
    session = new TerminalSession({
      name: 'buffer-test',
      command: ['echo', 'test output'],
      cwd: process.cwd(),
      outputBufferSize: 100,
    });

    await session.start();

    // Wait for process to complete and output to be buffered
    await new Promise((resolve) => setTimeout(resolve, 200));

    const buffer = session.getOutputBuffer();
    expect(Array.isArray(buffer)).toBe(true);

    session.clearOutputBuffer();
    expect(session.getOutputBuffer()).toHaveLength(0);
  });
});

describe('TerminalSession message handling (no PTY)', () => {
  test('handleMessage validates resize message dimensions', () => {
    const session = new TerminalSession({
      name: 'resize-validation',
      command: ['cat'],
      cwd: process.cwd(),
    });

    const ws = createMockWebSocket();

    // Invalid resize - negative cols
    session.handleMessage(ws, JSON.stringify({ type: 'resize', cols: -1, rows: 24 }));
    expect(ws.sentMessages).toHaveLength(1);
    const response = JSON.parse(ws.sentMessages[0]);
    expect(response.type).toBe('error');
  });

  test('handleMessage validates input message data', () => {
    const session = new TerminalSession({
      name: 'input-validation',
      command: ['cat'],
      cwd: process.cwd(),
    });

    const ws = createMockWebSocket();

    // Invalid input - missing data
    session.handleMessage(ws, JSON.stringify({ type: 'input' }));
    expect(ws.sentMessages).toHaveLength(1);
    const response = JSON.parse(ws.sentMessages[0]);
    expect(response.type).toBe('error');
  });
});
