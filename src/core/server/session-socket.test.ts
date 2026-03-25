/**
 * Tests for Session Socket Server
 *
 * Tests the Unix domain socket server that enables CLI attach
 * via `bunterm connect`.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { createConnection, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createSessionSocket, type SessionSocketResult } from './session-socket.js';

// Minimal mock of TerminalSession for socket testing
function createMockSession(name: string) {
  const rawOutputListeners = new Set<(data: Uint8Array) => void>();
  const writtenData: Uint8Array[] = [];
  const resizes: Array<{ cols: number; rows: number }> = [];

  return {
    name,
    ptyMasterFd: null as number | null, // null forces relay mode in tests
    writtenData,
    resizes,
    rawOutputListeners,
    addRawOutputListener(listener: (data: Uint8Array) => void): void {
      rawOutputListeners.add(listener);
    },
    removeRawOutputListener(listener: (data: Uint8Array) => void): void {
      rawOutputListeners.delete(listener);
    },
    writeBytes(data: Uint8Array | Buffer): void {
      writtenData.push(new Uint8Array(data));
    },
    resize(cols: number, rows: number): void {
      resizes.push({ cols, rows });
    },
    /** Simulate PTY output by calling all raw output listeners */
    simulateOutput(data: Uint8Array): void {
      for (const listener of rawOutputListeners) {
        listener(data);
      }
    }
  };
}

// biome-ignore lint: mock type lacks full TerminalSession interface
type MockSession = ReturnType<typeof createMockSession>;

// Helper to set up state dir for tests
function setupTestStateDir(): string {
  const testDir = join(
    tmpdir(),
    `bunterm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(testDir, { recursive: true });
  process.env['BUNTERM_STATE_DIR'] = testDir;
  return testDir;
}

function connectToSocket(socketPath: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    socket.on('connect', () => resolve(socket));
    socket.on('error', reject);
  });
}

describe('createSessionSocket', () => {
  let testDir: string;
  let socketResult: SessionSocketResult | null = null;

  beforeEach(() => {
    testDir = setupTestStateDir();
  });

  afterEach(() => {
    if (socketResult) {
      socketResult.cleanup();
      socketResult = null;
    }
    delete process.env['BUNTERM_STATE_DIR'];
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('creates a .sock file in sessions directory', async () => {
    const session = createMockSession('test-session');
    // biome-ignore lint: mock type lacks full TerminalSession interface
    socketResult = createSessionSocket(session as any);

    const expectedPath = join(testDir, 'sessions', 'test-session.sock');
    expect(socketResult.socketPath).toBe(expectedPath);

    // Wait for server to start listening
    await new Promise<void>((resolve) => {
      if (socketResult!.server.listening) {
        resolve();
      } else {
        socketResult!.server.on('listening', resolve);
      }
    });

    expect(existsSync(expectedPath)).toBe(true);
  });

  test('client can connect to the socket', async () => {
    const session = createMockSession('connect-test');
    // biome-ignore lint: mock type lacks full TerminalSession interface
    socketResult = createSessionSocket(session as any);

    // Wait for server to start listening
    await new Promise<void>((resolve) => {
      if (socketResult!.server.listening) {
        resolve();
      } else {
        socketResult!.server.on('listening', resolve);
      }
    });

    const client = await connectToSocket(socketResult.socketPath);
    expect(client.destroyed).toBe(false);
    client.destroy();
  });

  test('cleanup removes the .sock file', async () => {
    const session = createMockSession('cleanup-test');
    // biome-ignore lint: mock type lacks full TerminalSession interface
    socketResult = createSessionSocket(session as any);

    // Wait for server to start listening
    await new Promise<void>((resolve) => {
      if (socketResult!.server.listening) {
        resolve();
      } else {
        socketResult!.server.on('listening', resolve);
      }
    });

    const sockPath = socketResult.socketPath;
    expect(existsSync(sockPath)).toBe(true);

    socketResult.cleanup();
    socketResult = null;

    expect(existsSync(sockPath)).toBe(false);
  });

  test('cleanup removes raw output listener', () => {
    const session = createMockSession('listener-cleanup-test');
    // biome-ignore lint: mock type lacks full TerminalSession interface
    socketResult = createSessionSocket(session as any);

    expect(session.rawOutputListeners.size).toBe(1);

    socketResult.cleanup();
    socketResult = null;

    expect(session.rawOutputListeners.size).toBe(0);
  });

  test('client receives PTY output', async () => {
    const session = createMockSession('output-test');
    // biome-ignore lint: mock type lacks full TerminalSession interface
    socketResult = createSessionSocket(session as any);

    await new Promise<void>((resolve) => {
      if (socketResult!.server.listening) {
        resolve();
      } else {
        socketResult!.server.on('listening', resolve);
      }
    });

    const client = await connectToSocket(socketResult.socketPath);

    const received = await new Promise<Buffer>((resolve) => {
      client.on('data', (data: Buffer) => {
        resolve(data);
      });
      // Simulate PTY output
      session.simulateOutput(new TextEncoder().encode('hello world'));
    });

    expect(received.toString()).toBe('hello world');
    client.destroy();
  });

  test('client input is written to PTY', async () => {
    const session = createMockSession('input-test');
    // biome-ignore lint: mock type lacks full TerminalSession interface
    socketResult = createSessionSocket(session as any);

    await new Promise<void>((resolve) => {
      if (socketResult!.server.listening) {
        resolve();
      } else {
        socketResult!.server.on('listening', resolve);
      }
    });

    const client = await connectToSocket(socketResult.socketPath);

    // Send input from client
    client.write(Buffer.from('ls -la\n'));

    // Wait for data to be processed
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(session.writtenData.length).toBe(1);
    expect(new TextDecoder().decode(session.writtenData[0])).toBe('ls -la\n');
    client.destroy();
  });

  test('resize control message triggers session resize', async () => {
    const session = createMockSession('resize-test');
    // biome-ignore lint: mock type lacks full TerminalSession interface
    socketResult = createSessionSocket(session as any);

    await new Promise<void>((resolve) => {
      if (socketResult!.server.listening) {
        resolve();
      } else {
        socketResult!.server.on('listening', resolve);
      }
    });

    const client = await connectToSocket(socketResult.socketPath);

    // Send a resize control message (0x01 prefix + JSON)
    const resizeJson = JSON.stringify({ type: 'resize', cols: 120, rows: 40 });
    const buf = Buffer.alloc(1 + Buffer.byteLength(resizeJson));
    buf[0] = 0x01;
    buf.write(resizeJson, 1);
    client.write(buf);

    // Wait for data to be processed
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(session.resizes.length).toBe(1);
    expect(session.resizes[0]).toEqual({ cols: 120, rows: 40 });
    client.destroy();
  });

  test('cleanup is idempotent', () => {
    const session = createMockSession('idempotent-test');
    // biome-ignore lint: mock type lacks full TerminalSession interface
    socketResult = createSessionSocket(session as any);

    // Should not throw when called multiple times
    socketResult.cleanup();
    socketResult.cleanup();
    socketResult = null;
  });
});
