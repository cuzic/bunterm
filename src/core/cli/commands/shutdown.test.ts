import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import type { Socket } from 'node:net';
import { resetDaemonClientDeps, setDaemonClientDeps } from '@/core/client/daemon-client.js';
import { createInMemoryStateStore } from '@/core/config/state-store.js';
import { createMockSocketClient } from '@/utils/socket-client.js';
import { shutdownCommand } from './shutdown.js';

/**
 * Create a mock Socket for testing that properly simulates connect -> write -> data flow
 */
function createMockSocketWithResponse(
  commands: string[],
  responseMap: Record<string, string>
): Socket {
  const emitter = new EventEmitter() as Socket;

  emitter.write = (data: string | Buffer) => {
    const cmd = data.toString();
    commands.push(cmd);
    const response = responseMap[cmd] ?? 'unknown';
    setTimeout(() => {
      emitter.emit('data', Buffer.from(response));
    }, 5);
    return true;
  };

  emitter.end = () => emitter;
  emitter.destroy = () => emitter;
  emitter.setTimeout = () => emitter;

  // Emit connect after a small delay
  setTimeout(() => {
    emitter.emit('connect');
  }, 5);

  return emitter;
}

describe('shutdown command', () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let logs: string[];

  beforeEach(() => {
    logs = [];
    consoleLogSpy = spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg);
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    resetDaemonClientDeps();
  });

  test('prints message when daemon is not running', async () => {
    const stateStore = createInMemoryStateStore();
    const socketClient = createMockSocketClient({
      exists: () => false
    });

    setDaemonClientDeps({ stateStore, socketClient });

    await shutdownCommand({});

    expect(logs).toContain('Daemon is not running.');
  });

  test('shuts down daemon without stopping sessions by default', async () => {
    const stateStore = createInMemoryStateStore();
    const commands: string[] = [];

    const socketClient = createMockSocketClient({
      exists: () => true,
      connect: () =>
        createMockSocketWithResponse(commands, {
          ping: 'pong',
          shutdown: 'ok'
        })
    });

    setDaemonClientDeps({ stateStore, socketClient });

    await shutdownCommand({});

    expect(commands).toContain('ping');
    expect(commands).toContain('shutdown');
    expect(logs.some((log) => log.includes('sessions will be preserved'))).toBe(true);
  });

  test('stops sessions when --stop-sessions option is provided', async () => {
    const stateStore = createInMemoryStateStore();
    const commands: string[] = [];

    const socketClient = createMockSocketClient({
      exists: () => true,
      connect: () =>
        createMockSocketWithResponse(commands, {
          ping: 'pong',
          'shutdown-with-sessions': 'ok'
        })
    });

    setDaemonClientDeps({ stateStore, socketClient });

    await shutdownCommand({ stopSessions: true });

    expect(commands).toContain('ping');
    expect(commands).toContain('shutdown-with-sessions');
    expect(logs.some((log) => log.includes('Stopping all sessions'))).toBe(true);
  });
});
