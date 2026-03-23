/**
 * Tests for OSC Notification Parser (OSC 9/99/777)
 */
import { describe, expect, test } from 'bun:test';
import { parseOscNotifications } from './osc-notification-parser.js';

describe('parseOscNotifications', () => {
  // === OSC 9 ===

  describe('OSC 9 (simple notification)', () => {
    test('parses OSC 9 with BEL terminator', () => {
      const input = '\x1b]9;Hello World\x07';
      const result = parseOscNotifications(input);
      expect(result.notifications).toEqual([{ type: 'osc9', body: 'Hello World' }]);
      expect(result.filteredOutput).toBe('');
    });

    test('parses OSC 9 with ST terminator (ESC \\)', () => {
      const input = '\x1b]9;Hello World\x1b\\';
      const result = parseOscNotifications(input);
      expect(result.notifications).toEqual([{ type: 'osc9', body: 'Hello World' }]);
      expect(result.filteredOutput).toBe('');
    });

    test('parses OSC 9 with surrounding text', () => {
      const input = 'before\x1b]9;notify me\x07after';
      const result = parseOscNotifications(input);
      expect(result.notifications).toEqual([{ type: 'osc9', body: 'notify me' }]);
      expect(result.filteredOutput).toBe('beforeafter');
    });
  });

  // === OSC 777 ===

  describe('OSC 777 (notify with title)', () => {
    test('parses OSC 777 with title and body', () => {
      const input = '\x1b]777;notify;Build;Compilation finished\x07';
      const result = parseOscNotifications(input);
      expect(result.notifications).toEqual([
        { type: 'osc777', title: 'Build', body: 'Compilation finished' }
      ]);
      expect(result.filteredOutput).toBe('');
    });

    test('parses OSC 777 with ST terminator', () => {
      const input = '\x1b]777;notify;Test;All passed\x1b\\';
      const result = parseOscNotifications(input);
      expect(result.notifications).toEqual([{ type: 'osc777', title: 'Test', body: 'All passed' }]);
      expect(result.filteredOutput).toBe('');
    });

    test('ignores non-notify OSC 777 subcommands', () => {
      const input = '\x1b]777;other;data\x07';
      const result = parseOscNotifications(input);
      expect(result.notifications).toEqual([]);
      expect(result.filteredOutput).toBe('');
    });
  });

  // === OSC 99 ===

  describe('OSC 99 (kitty notification)', () => {
    test('parses OSC 99 with simple body', () => {
      const input = '\x1b]99;;Done!\x07';
      const result = parseOscNotifications(input);
      expect(result.notifications).toEqual([{ type: 'osc99', body: 'Done!' }]);
      expect(result.filteredOutput).toBe('');
    });

    test('parses OSC 99 with key=value params and body', () => {
      const input = '\x1b]99;i=1:d=0;Task complete\x07';
      const result = parseOscNotifications(input);
      expect(result.notifications).toEqual([{ type: 'osc99', body: 'Task complete' }]);
      expect(result.filteredOutput).toBe('');
    });

    test('parses OSC 99 with ST terminator', () => {
      const input = '\x1b]99;;Hello\x1b\\';
      const result = parseOscNotifications(input);
      expect(result.notifications).toEqual([{ type: 'osc99', body: 'Hello' }]);
      expect(result.filteredOutput).toBe('');
    });
  });

  // === Filtering ===

  describe('output filtering', () => {
    test('removes OSC sequences from output', () => {
      const input = 'line1\n\x1b]9;alert\x07line2\n';
      const result = parseOscNotifications(input);
      expect(result.filteredOutput).toBe('line1\nline2\n');
      expect(result.notifications).toHaveLength(1);
    });

    test('preserves output when no OSC notifications present', () => {
      const input = 'normal terminal output\n';
      const result = parseOscNotifications(input);
      expect(result.filteredOutput).toBe('normal terminal output\n');
      expect(result.notifications).toEqual([]);
    });
  });

  // === Mixed sequences ===

  describe('mixed sequences', () => {
    test('parses multiple notification types in one input', () => {
      const input = 'start\x1b]9;first\x07middle\x1b]777;notify;Title;second\x07end';
      const result = parseOscNotifications(input);
      expect(result.filteredOutput).toBe('startmiddleend');
      expect(result.notifications).toEqual([
        { type: 'osc9', body: 'first' },
        { type: 'osc777', title: 'Title', body: 'second' }
      ]);
    });

    test('handles OSC 633 sequences gracefully (passes through)', () => {
      // OSC 633 is handled by Osc633Parser, not this parser
      // This parser should not consume OSC 633 sequences
      const input = '\x1b]633;A\x07\x1b]9;notify\x07';
      const result = parseOscNotifications(input);
      expect(result.notifications).toEqual([{ type: 'osc9', body: 'notify' }]);
      // OSC 633 should remain in filtered output
      expect(result.filteredOutput).toBe('\x1b]633;A\x07');
    });
  });

  // === Edge cases ===

  describe('edge cases', () => {
    test('handles empty message body', () => {
      const input = '\x1b]9;\x07';
      const result = parseOscNotifications(input);
      expect(result.notifications).toEqual([{ type: 'osc9', body: '' }]);
    });

    test('handles incomplete sequence (no terminator)', () => {
      const input = 'text\x1b]9;incomplete';
      const result = parseOscNotifications(input);
      // Incomplete sequence should be preserved
      expect(result.filteredOutput).toBe('text\x1b]9;incomplete');
      expect(result.notifications).toEqual([]);
    });

    test('handles empty input', () => {
      const result = parseOscNotifications('');
      expect(result.filteredOutput).toBe('');
      expect(result.notifications).toEqual([]);
    });
  });
});
