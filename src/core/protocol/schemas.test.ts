import { describe, expect, test } from 'bun:test';
import {
  ClientMessageSchema,
  ServerMessageSchema,
  BlockSchema
} from './schemas.js';

describe('ClientMessageSchema', () => {
  test('parses valid input message', () => {
    const result = ClientMessageSchema.safeParse({
      type: 'input',
      data: 'hello'
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('input');
      expect(result.data.data).toBe('hello');
    }
  });

  test('parses valid resize message', () => {
    const result = ClientMessageSchema.safeParse({
      type: 'resize',
      cols: 80,
      rows: 24
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('resize');
      expect(result.data.cols).toBe(80);
      expect(result.data.rows).toBe(24);
    }
  });

  test('rejects resize with non-positive cols', () => {
    const result = ClientMessageSchema.safeParse({
      type: 'resize',
      cols: 0,
      rows: 24
    });
    expect(result.success).toBe(false);
  });

  test('parses valid ping message', () => {
    const result = ClientMessageSchema.safeParse({ type: 'ping' });
    expect(result.success).toBe(true);
  });

  test('parses valid watchFile message', () => {
    const result = ClientMessageSchema.safeParse({
      type: 'watchFile',
      path: '/path/to/file'
    });
    expect(result.success).toBe(true);
  });

  test('rejects watchFile with empty path', () => {
    const result = ClientMessageSchema.safeParse({
      type: 'watchFile',
      path: ''
    });
    expect(result.success).toBe(false);
  });

  test('rejects unknown message type', () => {
    const result = ClientMessageSchema.safeParse({
      type: 'unknown',
      data: 'test'
    });
    expect(result.success).toBe(false);
  });

  test('rejects message without type', () => {
    const result = ClientMessageSchema.safeParse({
      data: 'test'
    });
    expect(result.success).toBe(false);
  });
});

describe('ServerMessageSchema', () => {
  test('parses valid output message', () => {
    const result = ServerMessageSchema.safeParse({
      type: 'output',
      data: 'SGVsbG8=' // Base64 "Hello"
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('output');
    }
  });

  test('parses valid title message', () => {
    const result = ServerMessageSchema.safeParse({
      type: 'title',
      title: 'My Terminal'
    });
    expect(result.success).toBe(true);
  });

  test('parses valid exit message', () => {
    const result = ServerMessageSchema.safeParse({
      type: 'exit',
      code: 0
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe(0);
    }
  });

  test('parses valid pong message', () => {
    const result = ServerMessageSchema.safeParse({ type: 'pong' });
    expect(result.success).toBe(true);
  });

  test('parses valid error message', () => {
    const result = ServerMessageSchema.safeParse({
      type: 'error',
      message: 'Something went wrong'
    });
    expect(result.success).toBe(true);
  });

  test('parses valid bell message', () => {
    const result = ServerMessageSchema.safeParse({ type: 'bell' });
    expect(result.success).toBe(true);
  });

  test('parses valid fileChange message', () => {
    const result = ServerMessageSchema.safeParse({
      type: 'fileChange',
      path: '/path/to/file',
      timestamp: 1234567890
    });
    expect(result.success).toBe(true);
  });

  test('parses valid blockStart message', () => {
    const result = ServerMessageSchema.safeParse({
      type: 'blockStart',
      block: {
        id: 'block-1',
        command: 'ls -la',
        output: 'base64data',
        startedAt: '2024-01-01T00:00:00Z',
        status: 'running',
        startLine: 10
      }
    });
    expect(result.success).toBe(true);
  });

  test('parses valid ai_stream message', () => {
    const result = ServerMessageSchema.safeParse({
      type: 'ai_stream',
      runId: 'run-123',
      seq: 1,
      delta: 'Hello'
    });
    expect(result.success).toBe(true);
  });

  test('parses valid ai_final message', () => {
    const result = ServerMessageSchema.safeParse({
      type: 'ai_final',
      runId: 'run-123',
      result: {
        content: 'Response content',
        citations: [],
        nextCommands: []
      },
      usage: {
        inputTokens: 100,
        outputTokens: 50
      },
      elapsedMs: 1500
    });
    expect(result.success).toBe(true);
  });

  test('parses valid claudeAssistantText message', () => {
    const result = ServerMessageSchema.safeParse({
      type: 'claudeAssistantText',
      uuid: 'uuid-123',
      text: 'Assistant response',
      timestamp: '2024-01-01T00:00:00Z'
    });
    expect(result.success).toBe(true);
  });

  test('rejects unknown message type', () => {
    const result = ServerMessageSchema.safeParse({
      type: 'unknown'
    });
    expect(result.success).toBe(false);
  });
});

describe('BlockSchema', () => {
  test('parses valid block', () => {
    const result = BlockSchema.safeParse({
      id: 'block-1',
      command: 'echo hello',
      output: 'aGVsbG8=',
      startedAt: '2024-01-01T00:00:00Z',
      status: 'success',
      startLine: 10,
      exitCode: 0,
      endedAt: '2024-01-01T00:00:01Z',
      endLine: 15
    });
    expect(result.success).toBe(true);
  });

  test('parses block without optional fields', () => {
    const result = BlockSchema.safeParse({
      id: 'block-1',
      command: 'echo hello',
      output: 'aGVsbG8=',
      startedAt: '2024-01-01T00:00:00Z',
      status: 'running',
      startLine: 10
    });
    expect(result.success).toBe(true);
  });

  test('rejects invalid status', () => {
    const result = BlockSchema.safeParse({
      id: 'block-1',
      command: 'echo hello',
      output: 'aGVsbG8=',
      startedAt: '2024-01-01T00:00:00Z',
      status: 'invalid',
      startLine: 10
    });
    expect(result.success).toBe(false);
  });
});
