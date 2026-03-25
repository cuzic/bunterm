/**
 * Unix socket binary relay for PTY I/O.
 * Pure byte pipe — no JSON, no base64.
 *
 * Control message protocol:
 * - First byte 0x01 = control message (rest is JSON: {type: "resize", cols: N, rows: N})
 * - Any other first byte = data (pass through to PTY as-is)
 */
import { createReadStream, writeSync } from 'node:fs';
import type { Socket } from 'node:net';
import type { Readable } from 'node:stream';

const CONTROL_PREFIX = 0x01;

export interface RelayOptions {
  /** Client socket */
  socket: Socket;
  /** PTY file descriptor to relay */
  ptyFd: number;
}

/** Start relaying between socket and PTY. Returns cleanup function. */
export function startRelay(options: RelayOptions): () => void {
  const { socket, ptyFd } = options;
  let cleaned = false;

  // PTY fd → socket: read from PTY fd and pipe to socket
  let ptyReadStream: Readable | null = null;
  try {
    ptyReadStream = createReadStream('', { fd: ptyFd, autoClose: false });
    ptyReadStream.on('data', (chunk: Buffer) => {
      if (!socket.destroyed) {
        socket.write(chunk);
      }
    });
    ptyReadStream.on('error', () => {
      // PTY fd may close when session ends — ignore
    });
  } catch {
    // fd may not be readable (e.g. stdout in tests) — ignore
  }

  // Socket → PTY fd: receive data from socket, parse control messages, write data to PTY
  const onData = (data: Buffer) => {
    const ctrl = parseControlMessage(data);
    if (ctrl) {
      // Resize is handled by the caller via the control message;
      // we don't have direct access to terminal.resize() here.
      // The caller should listen for resize events separately.
      return;
    }
    // Write raw data to PTY fd
    try {
      writeSync(ptyFd, data);
    } catch {
      // PTY fd may be closed — ignore write errors
    }
  };

  socket.on('data', onData);

  const onSocketClose = () => {
    cleanup();
  };
  socket.on('close', onSocketClose);

  function cleanup(): void {
    if (cleaned) return;
    cleaned = true;

    socket.removeListener('data', onData);
    socket.removeListener('close', onSocketClose);

    if (ptyReadStream) {
      ptyReadStream.destroy();
      ptyReadStream = null;
    }
  }

  return cleanup;
}

/** Parse a control message (resize). Returns null for data messages. */
export function parseControlMessage(data: Buffer): { cols: number; rows: number } | null {
  if (data.length === 0) return null;
  if (data[0] !== CONTROL_PREFIX) return null;

  try {
    const msg = JSON.parse(data.subarray(1).toString());
    if (typeof msg.cols === 'number' && typeof msg.rows === 'number') {
      return { cols: msg.cols, rows: msg.rows };
    }
  } catch {
    // Invalid JSON — not a control message
  }
  return null;
}

/** Create a resize control message. */
export function createResizeMessage(cols: number, rows: number): Buffer {
  const json = JSON.stringify({ type: 'resize', cols, rows });
  const buf = Buffer.alloc(1 + Buffer.byteLength(json));
  buf[0] = CONTROL_PREFIX;
  buf.write(json, 1);
  return buf;
}
