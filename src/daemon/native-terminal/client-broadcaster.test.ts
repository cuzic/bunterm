import { describe, expect, it, mock, spyOn } from 'bun:test';
import { ClientBroadcaster } from './client-broadcaster.js';
import type { NativeTerminalWebSocket, ServerMessage } from './types.js';

// Mock WebSocket for testing
function createMockWebSocket(): NativeTerminalWebSocket {
  return {
    send: mock(() => {}),
    close: mock(() => {}),
    readyState: 1 // OPEN
  } as unknown as NativeTerminalWebSocket;
}

describe('ClientBroadcaster', () => {
  describe('client management', () => {
    it('should add and remove clients', () => {
      const broadcaster = new ClientBroadcaster();
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      expect(broadcaster.clientCount).toBe(0);

      broadcaster.addClient(ws1);
      expect(broadcaster.clientCount).toBe(1);

      broadcaster.addClient(ws2);
      expect(broadcaster.clientCount).toBe(2);

      broadcaster.removeClient(ws1);
      expect(broadcaster.clientCount).toBe(1);

      broadcaster.removeClient(ws2);
      expect(broadcaster.clientCount).toBe(0);
    });

    it('should handle removing non-existent client', () => {
      const broadcaster = new ClientBroadcaster();
      const ws = createMockWebSocket();

      // Should not throw
      broadcaster.removeClient(ws);
      expect(broadcaster.clientCount).toBe(0);
    });
  });

  describe('broadcast', () => {
    it('should broadcast message to all clients', () => {
      const broadcaster = new ClientBroadcaster();
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      broadcaster.addClient(ws1);
      broadcaster.addClient(ws2);

      const message: ServerMessage = { type: 'output', data: 'hello' };
      broadcaster.broadcast(message);

      expect(ws1.send).toHaveBeenCalledTimes(1);
      expect(ws2.send).toHaveBeenCalledTimes(1);
    });

    it('should handle send errors gracefully', () => {
      const broadcaster = new ClientBroadcaster();
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      // Make ws1 throw on send
      ws1.send = mock(() => {
        throw new Error('Connection closed');
      });

      broadcaster.addClient(ws1);
      broadcaster.addClient(ws2);

      // Should not throw, should still send to ws2
      const message: ServerMessage = { type: 'output', data: 'hello' };
      broadcaster.broadcast(message);

      expect(ws2.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('broadcastRaw', () => {
    it('should broadcast raw serialized data', () => {
      const broadcaster = new ClientBroadcaster();
      const ws = createMockWebSocket();

      broadcaster.addClient(ws);
      broadcaster.broadcastRaw('{"type":"output","data":"hello"}');

      expect(ws.send).toHaveBeenCalledWith('{"type":"output","data":"hello"}');
    });
  });

  describe('output buffer', () => {
    it('should buffer output', () => {
      const broadcaster = new ClientBroadcaster({ maxOutputBuffer: 100 });

      broadcaster.bufferOutput('line 1');
      broadcaster.bufferOutput('line 2');
      broadcaster.bufferOutput('line 3');

      const buffer = broadcaster.getOutputBuffer();
      expect(buffer).toEqual(['line 1', 'line 2', 'line 3']);
    });

    it('should respect maxOutputBuffer', () => {
      const broadcaster = new ClientBroadcaster({ maxOutputBuffer: 3 });

      broadcaster.bufferOutput('line 1');
      broadcaster.bufferOutput('line 2');
      broadcaster.bufferOutput('line 3');
      broadcaster.bufferOutput('line 4');

      const buffer = broadcaster.getOutputBuffer();
      expect(buffer).toEqual(['line 2', 'line 3', 'line 4']);
    });

    it('should clear output buffer', () => {
      const broadcaster = new ClientBroadcaster();

      broadcaster.bufferOutput('line 1');
      broadcaster.bufferOutput('line 2');
      broadcaster.clearOutputBuffer();

      expect(broadcaster.getOutputBuffer()).toHaveLength(0);
    });
  });

  describe('replayTo', () => {
    it('should replay buffered output to specific client', () => {
      const broadcaster = new ClientBroadcaster({ replayCount: 100 });
      const ws = createMockWebSocket();

      broadcaster.bufferOutput('line 1');
      broadcaster.bufferOutput('line 2');
      broadcaster.addClient(ws);

      broadcaster.replayTo(ws);

      expect(ws.send).toHaveBeenCalledTimes(2);
    });

    it('should respect replayCount limit', () => {
      const broadcaster = new ClientBroadcaster({
        maxOutputBuffer: 100,
        replayCount: 2
      });
      const ws = createMockWebSocket();

      broadcaster.bufferOutput('line 1');
      broadcaster.bufferOutput('line 2');
      broadcaster.bufferOutput('line 3');
      broadcaster.bufferOutput('line 4');

      broadcaster.replayTo(ws);

      // Should only replay last 2 lines
      expect(ws.send).toHaveBeenCalledTimes(2);
    });

    it('should not send anything if buffer is empty', () => {
      const broadcaster = new ClientBroadcaster();
      const ws = createMockWebSocket();

      broadcaster.replayTo(ws);

      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe('sendBlockList', () => {
    it('should send block list to specific client', () => {
      const broadcaster = new ClientBroadcaster();
      const ws = createMockWebSocket();

      const blocks = [
        {
          id: 'block-1',
          command: 'ls',
          output: 'file.txt',
          startLine: 0,
          endLine: 1,
          exitCode: 0,
          startedAt: '2024-01-01T00:00:00Z',
          endedAt: '2024-01-01T00:00:01Z',
          cwd: '/home'
        }
      ];

      broadcaster.sendBlockList(ws, blocks);

      expect(ws.send).toHaveBeenCalledTimes(1);
    });

    it('should not send anything for empty block list', () => {
      const broadcaster = new ClientBroadcaster();
      const ws = createMockWebSocket();

      broadcaster.sendBlockList(ws, []);

      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe('closeAll', () => {
    it('should close all client connections', () => {
      const broadcaster = new ClientBroadcaster();
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      broadcaster.addClient(ws1);
      broadcaster.addClient(ws2);

      broadcaster.closeAll(1000, 'Session ended');

      expect(ws1.close).toHaveBeenCalledWith(1000, 'Session ended');
      expect(ws2.close).toHaveBeenCalledWith(1000, 'Session ended');
      expect(broadcaster.clientCount).toBe(0);
    });

    it('should handle close errors gracefully', () => {
      const broadcaster = new ClientBroadcaster();
      const ws = createMockWebSocket();

      ws.close = mock(() => {
        throw new Error('Already closed');
      });

      broadcaster.addClient(ws);

      // Should not throw
      broadcaster.closeAll();
      expect(broadcaster.clientCount).toBe(0);
    });
  });
});
