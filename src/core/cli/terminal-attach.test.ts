import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import * as net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { attachToSession } from './terminal-attach.js';

describe('attachToSession', () => {
  test('returns non-zero exit code when socket path does not exist', async () => {
    const result = await attachToSession({ socketPath: '/tmp/nonexistent-bunterm-test.sock' });
    expect(result).toBe(1);
  }, 5000);

  test('returns exit code 1 for invalid socket path', async () => {
    const result = await attachToSession({ socketPath: '/tmp/no-such-dir/invalid.sock' });
    expect(result).toBe(1);
  }, 5000);
});

describe('attachToSession raw mode', () => {
  test('does not crash when stdin is not a TTY', async () => {
    const isTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });

    const result = await attachToSession({ socketPath: '/tmp/nonexistent-bunterm-test.sock' });
    expect(result).toBe(1);

    Object.defineProperty(process.stdin, 'isTTY', { value: isTTY, configurable: true });
  }, 5000);
});

// --- Integration tests ---

interface TestSocketServer {
  socketPath: string;
  server: net.Server;
  onConnection: (cb: (socket: net.Socket) => void) => void;
  cleanup: () => Promise<void>;
}

async function createTestSocketServer(): Promise<TestSocketServer> {
  const socketPath = join(tmpdir(), `bunterm-test-${randomBytes(8).toString('hex')}.sock`);
  const server = net.createServer();

  let connectionCb: ((socket: net.Socket) => void) | null = null;
  server.on('connection', (socket) => {
    connectionCb?.(socket);
  });

  await new Promise<void>((resolve) => {
    server.listen(socketPath, resolve);
  });

  return {
    socketPath,
    server,
    onConnection: (cb) => {
      connectionCb = cb;
    },
    cleanup: async () => {
      server.close();
      try {
        await unlink(socketPath);
      } catch {
        // already removed
      }
    }
  };
}

describe('attachToSession integration', () => {
  let savedIsTTY: boolean | undefined;
  let testServer: TestSocketServer | null = null;

  beforeEach(() => {
    savedIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
  });

  afterEach(async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: savedIsTTY, configurable: true });
    if (testServer) {
      await testServer.cleanup();
      testServer = null;
    }
  });

  test('relay mode: data from server arrives at stdout', async () => {
    testServer = await createTestSocketServer();

    const received: Buffer[] = [];
    const writeSpy = spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      if (Buffer.isBuffer(chunk)) received.push(chunk);
      else if (typeof chunk === 'string') received.push(Buffer.from(chunk));
      return true;
    });

    testServer.onConnection((socket) => {
      // Delay write to after recvFd poll timeout (1000ms) so the first byte
      // isn't consumed by the fd-passing check's recvmsg call
      setTimeout(() => {
        socket.write('hello');
        setTimeout(() => socket.end(), 100);
      }, 1200);
    });

    const exitCode = await attachToSession({ socketPath: testServer.socketPath });

    writeSpy.mockRestore();

    expect(exitCode).toBe(0);
    const allData = Buffer.concat(received).toString();
    expect(allData).toContain('hello');
  }, 10000);

  test('server disconnect resolves with exit 0', async () => {
    testServer = await createTestSocketServer();

    // suppress stdout
    const writeSpy = spyOn(process.stdout, 'write').mockImplementation(() => true);

    testServer.onConnection((socket) => {
      // Delay end to after recvFd poll timeout
      setTimeout(() => socket.end(), 1200);
    });

    const exitCode = await attachToSession({ socketPath: testServer.socketPath });

    writeSpy.mockRestore();

    expect(exitCode).toBe(0);
  }, 10000);

  test('connection error returns exit 1', async () => {
    // Create a socket file that exists but has no server listening
    const socketPath = join(tmpdir(), `bunterm-test-dead-${randomBytes(8).toString('hex')}.sock`);
    await writeFile(socketPath, '');

    const stderrSpy = spyOn(process.stderr, 'write').mockImplementation(() => true);

    const exitCode = await attachToSession({ socketPath });

    stderrSpy.mockRestore();

    try {
      await unlink(socketPath);
    } catch {
      // ignore
    }

    expect(exitCode).toBe(1);
  }, 5000);

  test('cleanup removes stdin data and stdout resize listeners', async () => {
    testServer = await createTestSocketServer();

    const writeSpy = spyOn(process.stdout, 'write').mockImplementation(() => true);

    const stdinDataBefore = process.stdin.listenerCount('data');
    const stdoutResizeBefore = process.stdout.listenerCount('resize');

    testServer.onConnection((socket) => {
      // Delay end to after recvFd poll timeout
      setTimeout(() => socket.end(), 1200);
    });

    await attachToSession({ socketPath: testServer.socketPath });

    writeSpy.mockRestore();

    expect(process.stdin.listenerCount('data')).toBe(stdinDataBefore);
    expect(process.stdout.listenerCount('resize')).toBe(stdoutResizeBefore);
  }, 10000);

  test('sends resize message on connect', async () => {
    // Skip if columns/rows not available
    if (!process.stdout.columns || !process.stdout.rows) {
      return;
    }

    testServer = await createTestSocketServer();

    const writeSpy = spyOn(process.stdout, 'write').mockImplementation(() => true);

    const serverReceived: Buffer[] = [];

    testServer.onConnection((socket) => {
      socket.on('data', (data) => {
        serverReceived.push(Buffer.from(data));
      });
      // Wait for resize message (sent after recvFd timeout), then close
      setTimeout(() => socket.end(), 1500);
    });

    await attachToSession({ socketPath: testServer.socketPath });

    writeSpy.mockRestore();

    // Find a buffer starting with 0x01 (CONTROL_PREFIX)
    const controlMsg = serverReceived.find((buf) => buf[0] === 0x01);
    expect(controlMsg).toBeDefined();

    if (controlMsg) {
      const json = JSON.parse(controlMsg.subarray(1).toString());
      expect(json.type).toBe('resize');
      expect(typeof json.cols).toBe('number');
      expect(typeof json.rows).toBe('number');
    }
  }, 10000);
});
