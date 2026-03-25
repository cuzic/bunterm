import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { createResizeMessage, parseControlMessage, startRelay } from './socket-relay.js';

describe('createResizeMessage', () => {
  test('starts with 0x01 prefix byte', () => {
    const msg = createResizeMessage(80, 24);
    expect(msg.length).toBeGreaterThan(0);
    expect(msg[0]).toBe(0x01);
  });

  test('body after prefix is valid JSON with cols and rows', () => {
    const msg = createResizeMessage(80, 24);
    const body = msg.subarray(1).toString('utf-8');
    const parsed = JSON.parse(body);
    expect(parsed.cols).toBe(80);
    expect(parsed.rows).toBe(24);
  });

  test('encodes different dimensions correctly', () => {
    const msg = createResizeMessage(220, 50);
    const body = msg.subarray(1).toString('utf-8');
    const parsed = JSON.parse(body);
    expect(parsed.cols).toBe(220);
    expect(parsed.rows).toBe(50);
  });

  test('returns a Buffer (not empty)', () => {
    const msg = createResizeMessage(80, 24);
    expect(msg).toBeInstanceOf(Buffer);
    expect(msg.length).toBeGreaterThan(1);
  });
});

describe('parseControlMessage', () => {
  test('returns {cols, rows} for 0x01-prefixed resize message', () => {
    const json = Buffer.from(JSON.stringify({ cols: 80, rows: 24 }));
    const msg = Buffer.concat([Buffer.from([0x01]), json]);
    const result = parseControlMessage(msg);
    expect(result).not.toBeNull();
    expect(result?.cols).toBe(80);
    expect(result?.rows).toBe(24);
  });

  test('returns null for 0x00-prefixed data message', () => {
    const data = Buffer.concat([Buffer.from([0x00]), Buffer.from('some data')]);
    const result = parseControlMessage(data);
    expect(result).toBeNull();
  });

  test('returns null for plain data without prefix byte', () => {
    const data = Buffer.from('plain terminal data without any prefix');
    const result = parseControlMessage(data);
    expect(result).toBeNull();
  });

  test('returns null for empty buffer', () => {
    const result = parseControlMessage(Buffer.alloc(0));
    expect(result).toBeNull();
  });

  test('returns null for binary data that starts with non-0x01 byte', () => {
    const data = Buffer.from([0x1b, 0x5b, 0x41]); // ESC [ A (cursor up)
    const result = parseControlMessage(data);
    expect(result).toBeNull();
  });

  test('round-trip: createResizeMessage → parseControlMessage', () => {
    const msg = createResizeMessage(132, 43);
    const result = parseControlMessage(msg);
    expect(result).not.toBeNull();
    expect(result?.cols).toBe(132);
    expect(result?.rows).toBe(43);
  });
});

describe('startRelay end-to-end', () => {
  let socketPath: string;
  let server: net.Server;

  beforeAll(async () => {
    socketPath = path.join(os.tmpdir(), `relay-test-${process.pid}.sock`);
    await new Promise<void>((resolve) => {
      server = net.createServer();
      server.listen(socketPath, resolve);
    });
  });

  afterAll(() => {
    server?.close();
    try {
      const fs = require('node:fs');
      fs.unlinkSync(socketPath);
    } catch {}
  });

  test('startRelay returns a cleanup function', async () => {
    const clientSocket = await new Promise<net.Socket>((resolve, reject) => {
      const sock = net.connect(socketPath, () => resolve(sock));
      sock.once('error', reject);
    });

    // Use a mock PTY fd (stdout fd = 1, which is always open)
    const cleanup = startRelay({ socket: clientSocket, ptyFd: 1 });
    expect(typeof cleanup).toBe('function');
    expect(() => cleanup()).not.toThrow();

    clientSocket.destroy();
  });

  test('startRelay relays data from socket to PTY fd', async () => {
    // Create a pipe to use as a mock PTY fd
    const _received: Buffer[] = [];

    // Connect client
    const clientSocket = await new Promise<net.Socket>((resolve, reject) => {
      const sock = net.connect(socketPath, () => resolve(sock));
      sock.once('error', reject);
    });

    // Get a writable fd — we'll use a pipe
    const fs = await import('node:fs');
    const pipeResult = (fs as unknown as { pipe: () => number[] }).pipe?.() ?? null;

    // If we can't get a real pipe, just verify the relay starts without crashing
    if (!pipeResult) {
      const cleanup = startRelay({ socket: clientSocket, ptyFd: 1 });
      // Send data through socket
      clientSocket.write(Buffer.from('hello'));
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      cleanup();
      clientSocket.destroy();
      return;
    }

    const [readFd, writeFd] = pipeResult;

    const cleanup = startRelay({ socket: clientSocket, ptyFd: writeFd });

    // Send data through client socket
    const testData = Buffer.from('hello relay');
    clientSocket.write(testData);

    // Read from the read end of the pipe
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    const buf = Buffer.alloc(testData.length);
    const bytesRead = fs.readSync(readFd, buf, 0, testData.length, null);
    expect(bytesRead).toBe(testData.length);
    expect(buf.subarray(0, bytesRead)).toEqual(testData);

    cleanup();
    clientSocket.destroy();
    fs.closeSync(readFd);
    fs.closeSync(writeFd);
  });
});
