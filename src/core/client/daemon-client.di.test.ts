import { describe, expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import type { Socket } from 'node:net';
import { createInMemoryStateStore } from '@/config/state-store.js';
import { createMockProcessRunner } from '@/utils/process-runner.js';
import { createMockSocketClient } from '@/utils/socket-client.js';
import {
  ensureDaemon,
  isDaemonRunning,
  resetDaemonClientDeps,
  setDaemonClientDeps,
  shutdownDaemon
} from './daemon-client.js';

/**
 * Create a mock Socket for testing
 */
function createMockSocket(): Socket {
  const emitter = new EventEmitter() as Socket;
  emitter.write = () => true;
  emitter.end = () => emitter;
  emitter.destroy = () => emitter;
  emitter.setTimeout = () => emitter;
  return emitter;
}

describe('DaemonClient with DI', () => {
  describe('isDaemonRunning', () => {
    test('returns false when socket does not exist', async () => {
      const stateStore = createInMemoryStateStore();
      const socketClient = createMockSocketClient({
        exists: () => false
      });

      setDaemonClientDeps({ stateStore, socketClient });

      const result = await isDaemonRunning();

      expect(result).toBe(false);

      resetDaemonClientDeps();
    });

    test('returns true when daemon responds with pong', async () => {
      const stateStore = createInMemoryStateStore();
      const mockSocket = createMockSocket();

      const socketClient = createMockSocketClient({
        exists: () => true,
        connect: () => {
          // Simulate async connection and response
          setTimeout(() => {
            mockSocket.emit('connect');
          }, 10);
          setTimeout(() => {
            mockSocket.emit('data', Buffer.from('pong'));
          }, 20);
          return mockSocket;
        }
      });

      setDaemonClientDeps({ stateStore, socketClient });

      const result = await isDaemonRunning();

      expect(result).toBe(true);

      resetDaemonClientDeps();
    });

    test('returns false when daemon responds with unexpected data', async () => {
      const stateStore = createInMemoryStateStore();
      const mockSocket = createMockSocket();

      const socketClient = createMockSocketClient({
        exists: () => true,
        connect: () => {
          setTimeout(() => {
            mockSocket.emit('connect');
          }, 10);
          setTimeout(() => {
            mockSocket.emit('data', Buffer.from('unknown'));
          }, 20);
          return mockSocket;
        }
      });

      setDaemonClientDeps({ stateStore, socketClient });

      const result = await isDaemonRunning();

      expect(result).toBe(false);

      resetDaemonClientDeps();
    });

    test('returns false on connection error', async () => {
      const stateStore = createInMemoryStateStore();
      const mockSocket = createMockSocket();

      const socketClient = createMockSocketClient({
        exists: () => true,
        connect: () => {
          setTimeout(() => {
            mockSocket.emit('error', new Error('Connection refused'));
          }, 10);
          return mockSocket;
        }
      });

      setDaemonClientDeps({ stateStore, socketClient });

      const result = await isDaemonRunning();

      expect(result).toBe(false);

      resetDaemonClientDeps();
    });
  });

  describe('shutdownDaemon', () => {
    test('sends shutdown command when socket exists', async () => {
      const stateStore = createInMemoryStateStore();
      const mockSocket = createMockSocket();
      let writtenCommand = '';

      mockSocket.write = (data: string | Buffer) => {
        writtenCommand = data.toString();
        return true;
      };

      const socketClient = createMockSocketClient({
        exists: () => true,
        connect: () => {
          setTimeout(() => {
            mockSocket.emit('connect');
          }, 10);
          setTimeout(() => {
            mockSocket.emit('data', Buffer.from('ok'));
          }, 20);
          return mockSocket;
        }
      });

      setDaemonClientDeps({ stateStore, socketClient });

      await shutdownDaemon();

      expect(writtenCommand).toBe('shutdown');

      resetDaemonClientDeps();
    });

    test('sends shutdown-with-sessions command when stopSessions is true', async () => {
      const stateStore = createInMemoryStateStore();
      const mockSocket = createMockSocket();
      let writtenCommand = '';

      mockSocket.write = (data: string | Buffer) => {
        writtenCommand = data.toString();
        return true;
      };

      const socketClient = createMockSocketClient({
        exists: () => true,
        connect: () => {
          setTimeout(() => {
            mockSocket.emit('connect');
          }, 10);
          setTimeout(() => {
            mockSocket.emit('data', Buffer.from('ok'));
          }, 20);
          return mockSocket;
        }
      });

      setDaemonClientDeps({ stateStore, socketClient });

      await shutdownDaemon({ stopSessions: true });

      expect(writtenCommand).toBe('shutdown-with-sessions');

      resetDaemonClientDeps();
    });

    test('resolves immediately when socket does not exist', async () => {
      const stateStore = createInMemoryStateStore();
      const socketClient = createMockSocketClient({
        exists: () => false
      });

      setDaemonClientDeps({ stateStore, socketClient });

      // Should not throw and resolve quickly
      await shutdownDaemon();

      resetDaemonClientDeps();
    });

    test('rejects on unexpected response', async () => {
      const stateStore = createInMemoryStateStore();
      const mockSocket = createMockSocket();

      const socketClient = createMockSocketClient({
        exists: () => true,
        connect: () => {
          setTimeout(() => {
            mockSocket.emit('connect');
          }, 10);
          setTimeout(() => {
            mockSocket.emit('data', Buffer.from('error'));
          }, 20);
          return mockSocket;
        }
      });

      setDaemonClientDeps({ stateStore, socketClient });

      await expect(shutdownDaemon()).rejects.toThrow('Unexpected response');

      resetDaemonClientDeps();
    });

    test('rejects on connection error', async () => {
      const stateStore = createInMemoryStateStore();
      const mockSocket = createMockSocket();

      const socketClient = createMockSocketClient({
        exists: () => true,
        connect: () => {
          setTimeout(() => {
            mockSocket.emit('error', new Error('Connection refused'));
          }, 10);
          return mockSocket;
        }
      });

      setDaemonClientDeps({ stateStore, socketClient });

      await expect(shutdownDaemon()).rejects.toThrow('Connection refused');

      resetDaemonClientDeps();
    });
  });

  describe('ensureDaemon', () => {
    test('does not spawn if daemon is already running', async () => {
      const stateStore = createInMemoryStateStore();
      const mockSocket = createMockSocket();
      let spawnCalled = false;

      const socketClient = createMockSocketClient({
        exists: () => true,
        connect: () => {
          setTimeout(() => {
            mockSocket.emit('connect');
          }, 10);
          setTimeout(() => {
            mockSocket.emit('data', Buffer.from('pong'));
          }, 20);
          return mockSocket;
        }
      });

      const processRunner = createMockProcessRunner({
        spawn: () => {
          spawnCalled = true;
          throw new Error('Should not be called');
        }
      });

      setDaemonClientDeps({ stateStore, socketClient, processRunner });

      await ensureDaemon();

      expect(spawnCalled).toBe(false);

      resetDaemonClientDeps();
    });
  });
});
