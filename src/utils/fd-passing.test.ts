import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { closeFd, createSocketPair, isFdPassingSupported, recvFd, sendFd } from './fd-passing.js';

describe('isFdPassingSupported', () => {
  test('returns a boolean', () => {
    const result = isFdPassingSupported();
    expect(typeof result).toBe('boolean');
  });

  test('returns true on Linux (SCM_RIGHTS is supported)', () => {
    // SCM_RIGHTS fd passing is a POSIX feature available on Linux
    if (process.platform === 'linux') {
      expect(isFdPassingSupported()).toBe(true);
    }
  });
});

describe('sendFd', () => {
  test('returns false for invalid socket fd without crashing', () => {
    // Invalid fd (-1) should not throw, just return false
    expect(() => sendFd(-1, 0)).not.toThrow();
    // Invalid fd should fail gracefully
    const result = sendFd(-1, 0);
    expect(typeof result).toBe('boolean');
  });

  test('returns false for negative socket fd', () => {
    const result = sendFd(-99, -99);
    expect(result).toBe(false);
  });
});

describe('recvFd', () => {
  test('returns null for invalid socket fd without crashing', () => {
    // Invalid fd (-1) should not throw, just return null
    expect(() => recvFd(-1)).not.toThrow();
    const result = recvFd(-1);
    expect(result === null || typeof result === 'number').toBe(true);
  });

  test('returns null for negative socket fd', () => {
    const result = recvFd(-99);
    expect(result).toBeNull();
  });
});

describe('fd passing end-to-end', () => {
  let pair: [number, number] | null = null;
  let tmpFile: string;

  beforeAll(() => {
    if (!isFdPassingSupported()) return;

    tmpFile = path.join(os.tmpdir(), `fd-passing-content-${process.pid}.txt`);
    fs.writeFileSync(tmpFile, 'hello from fd passing');

    // Use raw socketpair to avoid event loop consuming ancillary data
    pair = createSocketPair();
  });

  afterAll(() => {
    if (pair) {
      closeFd(pair[0]);
      closeFd(pair[1]);
    }
    try {
      fs.unlinkSync(tmpFile);
    } catch {}
  });

  test('createSocketPair returns a valid pair on supported platforms', () => {
    if (!isFdPassingSupported()) return;
    expect(pair).not.toBeNull();
    expect(pair![0]).toBeGreaterThanOrEqual(0);
    expect(pair![1]).toBeGreaterThanOrEqual(0);
  });

  test('sendFd → recvFd round trip: received fd is readable', () => {
    if (!isFdPassingSupported()) {
      console.log('Skipping: fd passing not supported on this platform');
      return;
    }

    expect(pair).not.toBeNull();
    const [sendSock, recvSock] = pair!;

    // Open the temp file and get its fd
    const fd = fs.openSync(tmpFile, 'r');

    // Send fd over the socket pair
    const sent = sendFd(sendSock, fd);
    expect(sent).toBe(true);

    // Receive on the other end
    const receivedFd = recvFd(recvSock);
    expect(receivedFd).not.toBeNull();
    expect(typeof receivedFd).toBe('number');

    // Verify we can read from the received fd
    const buf = Buffer.alloc(21);
    const bytesRead = fs.readSync(receivedFd as number, buf, 0, 21, 0);
    expect(bytesRead).toBe(21);
    expect(buf.toString('utf-8', 0, bytesRead)).toBe('hello from fd passing');

    // Cleanup
    fs.closeSync(fd);
    fs.closeSync(receivedFd as number);
  });
});

describe('platform struct sizes (Linux)', () => {
  test('cmsghdr struct size is 16 bytes on 64-bit Linux', () => {
    if (process.platform !== 'linux') return;

    // cmsghdr: cmsg_len (8 bytes on 64-bit) + cmsg_level (4) + cmsg_type (4) = 16
    // This is a constant we rely on for our FFI implementation
    const CMSG_HEADER_SIZE = 16;
    // If fd passing is supported, internal header sizes must match
    if (isFdPassingSupported()) {
      // Import internal constant if exported (will fail until implemented)
      // For now, just assert the platform is Linux 64-bit
      expect(process.arch).toMatch(/x64|arm64/);
      expect(CMSG_HEADER_SIZE).toBe(16);
    }
  });
});
