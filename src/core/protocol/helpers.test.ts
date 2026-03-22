import { describe, expect, test } from 'bun:test';
import {
  parseClientMessage,
  parseClientMessageSafe,
  parseServerMessage,
  parseServerMessageSafe,
  serializeServerMessage,
  createOutputMessage,
  createErrorMessage,
  createExitMessage,
  createPongMessage,
  createBellMessage
} from './helpers.js';

describe('parseClientMessage', () => {
  test('parses valid input message', () => {
    const result = parseClientMessage('{"type":"input","data":"hello"}');
    expect(result).not.toBeNull();
    expect(result?.type).toBe('input');
    if (result?.type === 'input') {
      expect(result.data).toBe('hello');
    }
  });

  test('parses valid resize message', () => {
    const result = parseClientMessage('{"type":"resize","cols":80,"rows":24}');
    expect(result).not.toBeNull();
    expect(result?.type).toBe('resize');
  });

  test('parses valid ping message', () => {
    const result = parseClientMessage('{"type":"ping"}');
    expect(result).not.toBeNull();
    expect(result?.type).toBe('ping');
  });

  test('returns null for invalid JSON', () => {
    const result = parseClientMessage('{invalid}');
    expect(result).toBeNull();
  });

  test('returns null for unknown type', () => {
    const result = parseClientMessage('{"type":"unknown"}');
    expect(result).toBeNull();
  });

  test('returns null for missing required fields', () => {
    const result = parseClientMessage('{"type":"resize","cols":80}');
    expect(result).toBeNull();
  });
});

describe('parseClientMessageSafe', () => {
  test('returns ok for valid message', () => {
    const result = parseClientMessageSafe('{"type":"ping"}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('ping');
    }
  });

  test('returns error for invalid JSON', () => {
    const result = parseClientMessageSafe('{invalid}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Invalid JSON');
    }
  });

  test('returns error for validation failure', () => {
    const result = parseClientMessageSafe('{"type":"resize","cols":"not-a-number","rows":24}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Validation failed');
    }
  });
});

describe('parseServerMessage', () => {
  test('parses valid output message', () => {
    const result = parseServerMessage('{"type":"output","data":"SGVsbG8="}');
    expect(result).not.toBeNull();
    expect(result?.type).toBe('output');
  });

  test('parses valid pong message', () => {
    const result = parseServerMessage('{"type":"pong"}');
    expect(result).not.toBeNull();
    expect(result?.type).toBe('pong');
  });

  test('parses valid blockStart message', () => {
    const msg = JSON.stringify({
      type: 'blockStart',
      block: {
        id: 'b1',
        command: 'ls',
        output: '',
        startedAt: '2024-01-01',
        status: 'running',
        startLine: 1
      }
    });
    const result = parseServerMessage(msg);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('blockStart');
  });

  test('returns null for invalid JSON', () => {
    const result = parseServerMessage('{invalid}');
    expect(result).toBeNull();
  });
});

describe('parseServerMessageSafe', () => {
  test('returns ok for valid message', () => {
    const result = parseServerMessageSafe('{"type":"bell"}');
    expect(result.ok).toBe(true);
  });

  test('returns error details for invalid message', () => {
    const result = parseServerMessageSafe('{"type":"exit"}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Validation failed');
    }
  });
});

describe('serializeServerMessage', () => {
  test('serializes output message', () => {
    const msg = createOutputMessage(Buffer.from('hello'));
    const json = serializeServerMessage(msg);
    expect(JSON.parse(json)).toEqual({
      type: 'output',
      data: 'aGVsbG8='
    });
  });

  test('serializes error message', () => {
    const msg = createErrorMessage('Something went wrong');
    const json = serializeServerMessage(msg);
    expect(JSON.parse(json)).toEqual({
      type: 'error',
      message: 'Something went wrong'
    });
  });
});

describe('message creators', () => {
  test('createOutputMessage encodes to base64', () => {
    const msg = createOutputMessage(Buffer.from('test'));
    expect(msg.type).toBe('output');
    expect(msg.data).toBe('dGVzdA==');
  });

  test('createErrorMessage creates error', () => {
    const msg = createErrorMessage('Error!');
    expect(msg.type).toBe('error');
    expect(msg.message).toBe('Error!');
  });

  test('createExitMessage creates exit', () => {
    const msg = createExitMessage(0);
    expect(msg.type).toBe('exit');
    expect(msg.code).toBe(0);
  });

  test('createPongMessage creates pong', () => {
    const msg = createPongMessage();
    expect(msg.type).toBe('pong');
  });

  test('createBellMessage creates bell', () => {
    const msg = createBellMessage();
    expect(msg.type).toBe('bell');
  });
});
