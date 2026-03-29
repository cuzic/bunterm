/**
 * Terminal Attach — CLI client for connecting to bunterm sessions via Unix socket
 *
 * Connects to a running session via Unix domain socket, bridges stdin/stdout
 * with the remote PTY using a binary relay protocol (no JSON, no base64).
 */

import { access } from 'node:fs/promises';
import { createConnection, type Socket } from 'node:net';
import { isFdPassingSupported, recvFd } from '@/utils/fd-passing.js';
import { createResizeMessage } from '@/utils/socket-relay.js';

export interface AttachOptions {
  /** Unix socket path (e.g. ~/.local/state/bunterm/sessions/{name}.sock) */
  socketPath: string;
}

/**
 * Attach to a remote terminal session via Unix socket.
 * Returns exit code (0 = clean close, 1 = error).
 */
export async function attachToSession(options: AttachOptions): Promise<number> {
  // Check socket exists before attempting connection
  try {
    await access(options.socketPath);
  } catch {
    process.stderr.write(`Error: Socket not found: ${options.socketPath}\n`);
    return 1;
  }

  return new Promise((resolve) => {
    let rawModeSet = false;
    let resolved = false;

    const resolveOnce = (code: number) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(code);
    };

    const socket: Socket = createConnection(options.socketPath);

    // Send resize via socket (works in both fd and relay modes)
    const sendResize = () => {
      if (socket.destroyed) return;
      if (process.stdout.columns && process.stdout.rows) {
        socket.write(createResizeMessage(process.stdout.columns, process.stdout.rows));
      }
    };

    const enterRawMode = () => {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
        rawModeSet = true;
      }
      process.stdin.resume();
      process.stdout.on('resize', sendResize);
      sendResize();
    };

    socket.on('connect', () => {
      enterRawMode();

      // Try fd passing: receive PTY master fd from server
      const socketFd = (socket as unknown as { _handle?: { fd?: number } })._handle?.fd;
      if (socketFd !== undefined && isFdPassingSupported()) {
        const ptyFd = recvFd(socketFd);
        if (ptyFd !== null) {
          // Direct PTY mode — read/write to fd, keep socket for resize only
          setupDirectMode(ptyFd, socket, sendResize, resolveOnce);
          return;
        }
      }

      // Fallback: socket relay mode
      setupRelayMode(socket, sendResize, resolveOnce);
    });

    socket.on('error', () => resolveOnce(1));
    socket.on('close', () => resolveOnce(0));

    async function setupDirectMode(
      ptyFd: number,
      _controlSocket: Socket,
      resize: () => void,
      done: (code: number) => void
    ) {
      // Read from PTY fd → stdout
      const { createReadStream } = await import('node:fs');
      const readStream = createReadStream('', { fd: ptyFd, autoClose: false });
      readStream.on('data', (chunk: Buffer) => process.stdout.write(chunk));
      readStream.on('error', () => done(1));
      readStream.on('end', () => done(0));

      // stdin → write to PTY fd
      process.stdin.on('data', (data: Buffer) => {
        try {
          const { writeSync } = require('node:fs');
          writeSync(ptyFd, data);
        } catch {
          done(1);
        }
      });

      // Keep control socket for resize
      resize();
    }

    function setupRelayMode(relaySocket: Socket, resize: () => void, done: (code: number) => void) {
      // stdin → socket (raw bytes, no filtering needed for pure pipe)
      process.stdin.on('data', (data: Buffer) => {
        if (!relaySocket.destroyed) relaySocket.write(data);
      });

      // socket → stdout (raw PTY output)
      relaySocket.on('data', (data: Buffer) => process.stdout.write(data));
      relaySocket.on('error', () => done(1));
      relaySocket.on('close', () => done(0));

      resize();
    }

    function cleanup() {
      process.stdin.removeAllListeners('data');
      process.stdout.removeListener('resize', sendResize);
      if (rawModeSet && process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      if (!socket.destroyed) {
        socket.destroy();
      }
    }
  });
}
