import { describe, expect, test } from 'bun:test';
import {
  createErrorMessage,
  createExitMessage,
  createOutputMessage,
  createPongMessage,
  createTitleMessage,
  parseClientMessage,
  serializeServerMessage,
} from './types.js';

describe('parseClientMessage', () => {
  test('parses input message', () => {
    const result = parseClientMessage('{"type":"input","data":"ls -la"}');
    expect(result).toEqual({ type: 'input', data: 'ls -la' });
  });

  test('parses resize message', () => {
    const result = parseClientMessage('{"type":"resize","cols":120,"rows":40}');
    expect(result).toEqual({ type: 'resize', cols: 120, rows: 40 });
  });

  test('parses ping message', () => {
    const result = parseClientMessage('{"type":"ping"}');
    expect(result).toEqual({ type: 'ping' });
  });

  test('returns null for invalid JSON', () => {
    const result = parseClientMessage('not json');
    expect(result).toBeNull();
  });

  test('returns null for unknown message type', () => {
    const result = parseClientMessage('{"type":"unknown"}');
    expect(result).toBeNull();
  });

  test('returns null for missing data in input message', () => {
    const result = parseClientMessage('{"type":"input"}');
    expect(result).toBeNull();
  });

  test('returns null for invalid resize dimensions', () => {
    expect(parseClientMessage('{"type":"resize","cols":-1,"rows":24}')).toBeNull();
    expect(parseClientMessage('{"type":"resize","cols":80,"rows":0}')).toBeNull();
    expect(parseClientMessage('{"type":"resize","cols":"80","rows":24}')).toBeNull();
  });

  test('returns null for non-object JSON', () => {
    expect(parseClientMessage('"string"')).toBeNull();
    expect(parseClientMessage('123')).toBeNull();
    expect(parseClientMessage('null')).toBeNull();
    expect(parseClientMessage('[]')).toBeNull();
  });
});

describe('serializeServerMessage', () => {
  test('serializes output message', () => {
    const message = { type: 'output' as const, data: 'SGVsbG8=' };
    expect(serializeServerMessage(message)).toBe('{"type":"output","data":"SGVsbG8="}');
  });

  test('serializes title message', () => {
    const message = { type: 'title' as const, title: 'My Session' };
    expect(serializeServerMessage(message)).toBe('{"type":"title","title":"My Session"}');
  });

  test('serializes exit message', () => {
    const message = { type: 'exit' as const, code: 0 };
    expect(serializeServerMessage(message)).toBe('{"type":"exit","code":0}');
  });

  test('serializes pong message', () => {
    const message = { type: 'pong' as const };
    expect(serializeServerMessage(message)).toBe('{"type":"pong"}');
  });

  test('serializes error message', () => {
    const message = { type: 'error' as const, message: 'Something went wrong' };
    expect(serializeServerMessage(message)).toBe('{"type":"error","message":"Something went wrong"}');
  });
});

describe('createOutputMessage', () => {
  test('creates output message with Base64 encoded data', () => {
    const data = Buffer.from('Hello, World!');
    const message = createOutputMessage(data);

    expect(message.type).toBe('output');
    expect(message.data).toBe('SGVsbG8sIFdvcmxkIQ==');
  });

  test('handles Uint8Array input', () => {
    const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const message = createOutputMessage(data);

    expect(message.type).toBe('output');
    expect(message.data).toBe('SGVsbG8=');
  });

  test('handles binary data', () => {
    const data = Buffer.from([0x00, 0x01, 0x02, 0xff]);
    const message = createOutputMessage(data);

    expect(message.type).toBe('output');
    expect(message.data).toBe('AAEC/w==');
  });
});

describe('createErrorMessage', () => {
  test('creates error message', () => {
    const message = createErrorMessage('Connection lost');
    expect(message).toEqual({ type: 'error', message: 'Connection lost' });
  });
});

describe('createExitMessage', () => {
  test('creates exit message with code', () => {
    const message = createExitMessage(0);
    expect(message).toEqual({ type: 'exit', code: 0 });
  });

  test('creates exit message with non-zero code', () => {
    const message = createExitMessage(1);
    expect(message).toEqual({ type: 'exit', code: 1 });
  });
});

describe('createTitleMessage', () => {
  test('creates title message', () => {
    const message = createTitleMessage('user@host: ~');
    expect(message).toEqual({ type: 'title', title: 'user@host: ~' });
  });
});

describe('createPongMessage', () => {
  test('creates pong message', () => {
    const message = createPongMessage();
    expect(message).toEqual({ type: 'pong' });
  });
});
