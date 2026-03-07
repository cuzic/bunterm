/**
 * Message Parser Tests
 *
 * Tests for Claude Code JSONL message parsing.
 */

import { describe, expect, test } from 'bun:test';
import { parseHistoryEntry, parseSessionEntry, sessionEntryToMessages } from './message-parser.js';

describe('parseHistoryEntry', () => {
  test('should parse valid history entry', () => {
    const line = JSON.stringify({
      display: 'test command',
      pastedContents: {},
      timestamp: 1709200000000,
      project: '/home/cuzic/bunterm',
      sessionId: '4385c594-2e1f-4350-aef7-96ba9d44ba54'
    });

    const result = parseHistoryEntry(line);

    expect(result).not.toBeNull();
    expect(result?.display).toBe('test command');
    expect(result?.project).toBe('/home/cuzic/bunterm');
    expect(result?.sessionId).toBe('4385c594-2e1f-4350-aef7-96ba9d44ba54');
  });

  test('should return null for invalid JSON', () => {
    const result = parseHistoryEntry('not valid json');
    expect(result).toBeNull();
  });

  test('should return null for empty line', () => {
    const result = parseHistoryEntry('');
    expect(result).toBeNull();
  });

  test('should handle entry without sessionId', () => {
    const line = JSON.stringify({
      display: 'test',
      pastedContents: {},
      timestamp: 1709200000000,
      project: '/home/cuzic/bunterm'
    });

    const result = parseHistoryEntry(line);
    expect(result).not.toBeNull();
    expect(result?.sessionId).toBeUndefined();
  });
});

describe('parseSessionEntry', () => {
  test('should parse valid user session entry', () => {
    const line = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: 'Hello, Claude!'
      },
      uuid: 'test-uuid-123',
      parentUuid: null,
      timestamp: '2024-03-02T10:00:00Z',
      sessionId: 'test-session'
    });

    const result = parseSessionEntry(line);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('user');
    expect(result?.uuid).toBe('test-uuid-123');
  });

  test('should parse valid assistant session entry', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: [
        {
          type: 'text',
          text: 'Hello! How can I help you?'
        }
      ],
      uuid: 'test-uuid-456',
      parentUuid: 'test-uuid-123',
      timestamp: '2024-03-02T10:00:01Z',
      sessionId: 'test-session'
    });

    const result = parseSessionEntry(line);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('assistant');
    expect(result?.uuid).toBe('test-uuid-456');
  });

  test('should return null for invalid JSON', () => {
    const result = parseSessionEntry('not valid json');
    expect(result).toBeNull();
  });

  test('should return null for entry missing required fields', () => {
    const line = JSON.stringify({
      type: 'user'
      // missing uuid and message
    });

    const result = parseSessionEntry(line);
    expect(result).toBeNull();
  });
});

describe('sessionEntryToMessages', () => {
  test('should convert user entry to message', () => {
    const entry = {
      type: 'user' as const,
      message: {
        role: 'user' as const,
        content: 'Hello, Claude!'
      },
      uuid: 'test-uuid-123',
      parentUuid: null,
      timestamp: '2024-03-02T10:00:00Z',
      sessionId: 'test-session'
    };

    const messages = sessionEntryToMessages(entry);

    expect(messages.length).toBe(1);
    expect(messages[0]?.type).toBe('claudeUserMessage');

    const msg = messages[0] as { type: string; content: string; uuid: string };
    expect(msg.content).toBe('Hello, Claude!');
    expect(msg.uuid).toBe('test-uuid-123');
  });

  test('should convert assistant text to message', () => {
    const entry = {
      type: 'assistant' as const,
      message: [
        {
          type: 'text' as const,
          text: 'Hello! How can I help you?'
        }
      ],
      uuid: 'test-uuid-456',
      parentUuid: 'test-uuid-123',
      timestamp: '2024-03-02T10:00:01Z',
      sessionId: 'test-session'
    };

    const messages = sessionEntryToMessages(entry);

    expect(messages.length).toBe(1);
    expect(messages[0]?.type).toBe('claudeAssistantText');

    const msg = messages[0] as { type: string; text: string };
    expect(msg.text).toBe('Hello! How can I help you?');
  });

  test('should convert thinking block to message', () => {
    const entry = {
      type: 'assistant' as const,
      message: [
        {
          type: 'thinking' as const,
          thinking: 'Let me think about this...',
          signature: 'sig123'
        }
      ],
      uuid: 'test-uuid-789',
      parentUuid: 'test-uuid-456',
      timestamp: '2024-03-02T10:00:02Z',
      sessionId: 'test-session'
    };

    const messages = sessionEntryToMessages(entry);

    expect(messages.length).toBe(1);
    expect(messages[0]?.type).toBe('claudeThinking');

    const msg = messages[0] as { type: string; thinking: string };
    expect(msg.thinking).toBe('Let me think about this...');
  });

  test('should skip thinking block when disabled', () => {
    const entry = {
      type: 'assistant' as const,
      message: [
        {
          type: 'thinking' as const,
          thinking: 'Let me think...',
          signature: 'sig'
        }
      ],
      uuid: 'test-uuid',
      parentUuid: null,
      timestamp: '2024-03-02T10:00:00Z',
      sessionId: 'test-session'
    };

    const messages = sessionEntryToMessages(entry, { includeThinking: false });

    expect(messages.length).toBe(0);
  });

  test('should convert tool_use block to message', () => {
    const entry = {
      type: 'assistant' as const,
      message: [
        {
          type: 'tool_use' as const,
          id: 'tool-123',
          name: 'Bash',
          input: {
            command: 'ls -la'
          }
        }
      ],
      uuid: 'test-uuid-abc',
      parentUuid: 'test-uuid-789',
      timestamp: '2024-03-02T10:00:03Z',
      sessionId: 'test-session'
    };

    const messages = sessionEntryToMessages(entry);

    expect(messages.length).toBe(1);
    expect(messages[0]?.type).toBe('claudeToolUse');

    const msg = messages[0] as { type: string; toolName: string; input: Record<string, unknown> };
    expect(msg.toolName).toBe('Bash');
    expect(msg.input).toEqual({ command: 'ls -la' });
  });

  test('should convert tool_result block to message', () => {
    const entry = {
      type: 'assistant' as const,
      message: [
        {
          type: 'tool_result' as const,
          tool_use_id: 'tool-123',
          content: 'total 64\ndrwxr-xr-x 12 user user 4096 Mar 2 10:00 .'
        }
      ],
      uuid: 'test-uuid-def',
      parentUuid: 'test-uuid-abc',
      timestamp: '2024-03-02T10:00:04Z',
      sessionId: 'test-session'
    };

    const messages = sessionEntryToMessages(entry);

    expect(messages.length).toBe(1);
    expect(messages[0]?.type).toBe('claudeToolResult');

    const msg = messages[0] as { type: string; content: string };
    expect(msg.content).toContain('total 64');
  });

  test('should convert multiple content blocks to messages', () => {
    const entry = {
      type: 'assistant' as const,
      message: [
        { type: 'text' as const, text: 'Running command...' },
        { type: 'tool_use' as const, id: 'tool-456', name: 'Read', input: { file_path: '/test' } }
      ],
      uuid: 'test-uuid-multi',
      parentUuid: 'test-uuid-def',
      timestamp: '2024-03-02T10:00:05Z',
      sessionId: 'test-session'
    };

    const messages = sessionEntryToMessages(entry);

    expect(messages.length).toBe(2);
    expect(messages[0]?.type).toBe('claudeAssistantText');
    expect(messages[1]?.type).toBe('claudeToolUse');
  });

  test('should return empty array for unknown entry type', () => {
    const entry = {
      type: 'unknown' as const,
      message: 'something',
      uuid: 'test-uuid',
      parentUuid: null,
      timestamp: '2024-03-02T10:00:00Z',
      sessionId: 'test-session'
    };

    // @ts-expect-error - testing invalid type
    const messages = sessionEntryToMessages(entry);
    expect(messages).toEqual([]);
  });

  test('should skip meta entries', () => {
    const entry = {
      type: 'user' as const,
      message: {
        role: 'user' as const,
        content: 'test'
      },
      uuid: 'test-uuid',
      parentUuid: null,
      timestamp: '2024-03-02T10:00:00Z',
      sessionId: 'test-session',
      isMeta: true
    };

    const messages = sessionEntryToMessages(entry);
    expect(messages).toEqual([]);
  });
});
