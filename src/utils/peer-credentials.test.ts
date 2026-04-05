import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, unlinkSync } from 'node:fs';
import { createConnection, createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  getPeerCredentials,
  isPeerCredentialSupported,
  validateSameUser
} from './peer-credentials.js';

describe('isPeerCredentialSupported', () => {
  test('returns a boolean', () => {
    const result = isPeerCredentialSupported();
    expect(typeof result).toBe('boolean');
  });

  test('returns true on Linux', () => {
    if (process.platform === 'linux') {
      expect(isPeerCredentialSupported()).toBe(true);
    }
  });
});

describe('getPeerCredentials', () => {
  test('returns null for invalid fd (-1) without crashing', () => {
    expect(() => getPeerCredentials(-1)).not.toThrow();
    expect(getPeerCredentials(-1)).toBeNull();
  });

  test('returns null for negative fd', () => {
    expect(getPeerCredentials(-99)).toBeNull();
  });
});

describe('validateSameUser', () => {
  test('returns allowed=true for invalid fd (fail-open)', () => {
    const result = validateSameUser(-1);
    expect(result.allowed).toBe(true);
  });
});

describe('peer credentials end-to-end', () => {
  let server: Server | null = null;
  let client: Socket | null = null;
  let socketPath: string;

  beforeAll(() => {
    socketPath = join(tmpdir(), `peer-cred-test-${process.pid}-${Date.now()}.sock`);
    // Clean up stale socket
    if (existsSync(socketPath)) {
      try {
        unlinkSync(socketPath);
      } catch {}
    }
  });

  afterAll(() => {
    if (client && !client.destroyed) client.destroy();
    if (server) server.close();
    if (existsSync(socketPath)) {
      try {
        unlinkSync(socketPath);
      } catch {}
    }
  });

  test('retrieves correct UID/PID via Unix domain socket', async () => {
    if (!isPeerCredentialSupported()) {
      console.log('Skipping: peer credentials not supported on this platform');
      return;
    }

    const credentials = await new Promise<ReturnType<typeof getPeerCredentials>>(
      (resolve, reject) => {
        server = createServer((socket: Socket) => {
          const fd = (socket as unknown as { _handle?: { fd?: number } })._handle?.fd;
          if (fd === undefined) {
            reject(new Error('Could not get socket fd from _handle'));
            return;
          }
          const cred = getPeerCredentials(fd);
          resolve(cred);
          socket.destroy();
        });

        server.listen(socketPath, () => {
          client = createConnection(socketPath);
          client.on('error', reject);
        });

        server.on('error', reject);
      }
    );

    expect(credentials).not.toBeNull();
    expect(credentials!.uid).toBe(process.getuid!());

    if (process.platform === 'linux') {
      // Linux provides PID via SO_PEERCRED
      expect(credentials!.pid).toBe(process.pid);
    }

    // GID should be a non-negative number
    expect(credentials!.gid).toBeGreaterThanOrEqual(0);
  });

  test('validateSameUser returns allowed=true for same user', async () => {
    if (!isPeerCredentialSupported()) {
      console.log('Skipping: peer credentials not supported on this platform');
      return;
    }

    // Clean up previous server/client
    if (client && !client.destroyed) client.destroy();
    if (server) server.close();

    const socketPath2 = `${socketPath}.2`;
    if (existsSync(socketPath2)) {
      try {
        unlinkSync(socketPath2);
      } catch {}
    }

    const result = await new Promise<ReturnType<typeof validateSameUser>>((resolve, reject) => {
      const srv = createServer((socket: Socket) => {
        const fd = (socket as unknown as { _handle?: { fd?: number } })._handle?.fd;
        if (fd === undefined) {
          reject(new Error('Could not get socket fd from _handle'));
          return;
        }
        resolve(validateSameUser(fd));
        socket.destroy();
        srv.close();
      });

      srv.listen(socketPath2, () => {
        const cli = createConnection(socketPath2);
        cli.on('error', reject);
      });

      srv.on('error', reject);
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('same user');

    // Cleanup
    if (existsSync(socketPath2)) {
      try {
        unlinkSync(socketPath2);
      } catch {}
    }
  });
});
