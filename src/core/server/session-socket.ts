/**
 * Session Socket Server
 *
 * Creates a Unix domain socket for each terminal session,
 * enabling CLI attach via `bunterm connect`.
 *
 * Protocol:
 * 1. Client connects to ~/.local/state/bunterm/sessions/{name}.sock
 * 2. Server sends raw PTY output to the client socket
 * 3. Client sends raw input or control messages to the server
 * 4. Control messages: 0x01 prefix = resize JSON, else raw data
 */

import { chmodSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import { join } from 'node:path';

import { getStateDir } from '@/core/config/state.js';
import type { TerminalSession } from '@/core/terminal/session.js';
import { isFdPassingSupported, sendFd } from '@/utils/fd-passing.js';
import { createLogger } from '@/utils/logger.js';
import { isPeerCredentialSupported, validateSameUser } from '@/utils/peer-credentials.js';
import { parseControlMessage } from '@/utils/socket-relay.js';

const log = createLogger('session-socket');

export interface SessionSocketResult {
  /** The net.Server listening on the Unix socket */
  server: Server;
  /** The path to the .sock file */
  socketPath: string;
  /** Cleanup function: closes server, removes .sock file, detaches listeners */
  cleanup: () => void;
}

export interface SessionSocketOptions {
  stateDir?: string;
}

/**
 * Ensure the sessions directory exists under the state dir.
 */
function ensureSessionsDir(stateDir: string): string {
  const sessionsDir = join(stateDir, 'sessions');
  if (!existsSync(sessionsDir)) {
    mkdirSync(sessionsDir, { recursive: true });
  }
  return sessionsDir;
}

/**
 * Create a Unix domain socket server for a terminal session.
 *
 * The socket relays raw PTY I/O between the session and CLI attach clients.
 * Multiple clients can connect simultaneously; each receives the same output.
 *
 * Input from clients is written to the PTY via session.writeBytes().
 * Resize control messages (0x01 prefix) trigger session.resize().
 * Raw PTY output is forwarded to all connected socket clients.
 */
export function createSessionSocket(
  session: TerminalSession,
  options?: SessionSocketOptions
): SessionSocketResult {
  const stateDir = options?.stateDir ?? getStateDir();
  const sessionsDir = ensureSessionsDir(stateDir);
  const socketPath = join(sessionsDir, `${session.name}.sock`);

  // Remove stale socket file if it exists
  if (existsSync(socketPath)) {
    try {
      unlinkSync(socketPath);
    } catch {
      // May fail if file is locked — ignore
    }
  }

  // Track connected socket clients for cleanup
  const connectedClients = new Set<Socket>();

  // Raw output listener: forwards PTY output to all socket clients
  const onRawOutput = (data: Uint8Array): void => {
    const buf = Buffer.from(data);
    for (const client of connectedClients) {
      if (!client.destroyed) {
        try {
          client.write(buf);
        } catch {
          // Client may have disconnected — ignore
        }
      }
    }
  };

  // Register raw output listener on the session
  session.addRawOutputListener(onRawOutput);

  const server = createServer((socket: Socket) => {
    // Credential check: reject connections from different users
    const socketFd = (socket as unknown as { _handle?: { fd?: number } })._handle?.fd;
    if (socketFd !== undefined && isPeerCredentialSupported()) {
      const result = validateSameUser(socketFd);
      if (!result.allowed) {
        log.warn(`Rejected session socket connection: ${result.reason}`);
        socket.destroy();
        return;
      }
    }

    connectedClients.add(socket);

    // Try fd passing: send PTY master fd to client
    const ptyFd = session.ptyMasterFd;
    if (ptyFd !== null && isFdPassingSupported()) {
      try {
        // Get raw socket fd from Node socket handle
        const socketFd = (socket as unknown as { _handle?: { fd?: number } })._handle?.fd;
        if (socketFd !== undefined) {
          const sent = sendFd(socketFd, ptyFd);
          if (sent) {
            // fd sent successfully — client will use it directly
            // Keep socket open for control messages (resize) only
            socket.on('data', (data: Buffer) => {
              const ctrl = parseControlMessage(data);
              if (ctrl) {
                session.resize(ctrl.cols, ctrl.rows);
              }
              // Ignore non-control data (client reads directly from PTY fd)
            });
            socket.on('close', () => connectedClients.delete(socket));
            socket.on('error', () => connectedClients.delete(socket));
            return; // Skip relay setup
          }
        }
      } catch {
        // fd passing failed — fall through to relay mode
      }
    }

    // Fallback: socket relay mode — handle input from the attached client
    socket.on('data', (data: Buffer) => {
      // Check for control messages (resize)
      const ctrl = parseControlMessage(data);
      if (ctrl) {
        session.resize(ctrl.cols, ctrl.rows);
        return;
      }

      // Raw terminal input — write to PTY
      session.writeBytes(data);
    });

    socket.on('close', () => {
      connectedClients.delete(socket);
    });

    socket.on('error', () => {
      connectedClients.delete(socket);
    });
  });

  server.listen(socketPath);

  // Restrict socket file to owner only (defense in depth)
  try {
    chmodSync(socketPath, 0o600);
  } catch {
    log.warn(`Failed to set permissions on session socket: ${socketPath}`);
  }

  let cleaned = false;

  function cleanup(): void {
    if (cleaned) return;
    cleaned = true;

    // Remove the raw output listener
    session.removeRawOutputListener(onRawOutput);

    // Close all connected clients
    for (const client of connectedClients) {
      if (!client.destroyed) {
        client.destroy();
      }
    }
    connectedClients.clear();

    // Close the server
    server.close();

    // Remove the socket file
    if (existsSync(socketPath)) {
      try {
        unlinkSync(socketPath);
      } catch {
        // May fail if already removed — ignore
      }
    }
  }

  return { server, socketPath, cleanup };
}
