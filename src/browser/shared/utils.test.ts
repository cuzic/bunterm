/**
 * Toolbar Client Utilities Tests
 *
 * Note: Browser-specific functions (isMobileDevice, getSessionNameFromURL, bindClick)
 * are tested via integration tests in the browser.
 * Unit tests here focus on pure functions.
 */

import { describe, expect, test } from 'bun:test';
import { truncateText } from './utils.js';

describe('truncateText', () => {
  test('returns text unchanged if shorter than maxLength', () => {
    expect(truncateText('hello', 10)).toBe('hello');
  });

  test('returns text unchanged if equal to maxLength', () => {
    expect(truncateText('hello', 5)).toBe('hello');
  });

  test('truncates text with default ellipsis', () => {
    expect(truncateText('hello world', 8)).toBe('hello...');
  });

  test('truncates text with custom suffix', () => {
    expect(truncateText('hello world', 8, '…')).toBe('hello w…');
  });

  test('handles empty string', () => {
    expect(truncateText('', 10)).toBe('');
  });

  test('handles maxLength equal to suffix length', () => {
    expect(truncateText('hello', 3)).toBe('...');
  });

  test('handles Japanese text', () => {
    expect(truncateText('こんにちは世界', 5)).toBe('こん...');
  });

  test('handles multi-byte characters correctly', () => {
    // Note: Emojis are 2 code units each in JavaScript
    expect(truncateText('🎉🎊🎁🎄', 3)).toBe('...');
    expect(truncateText('🎉🎊🎁🎄', 5)).toBe('🎉...');
  });
});
