import { describe, expect, test } from 'bun:test';
import { daemonNotRunning, sessionNotFound, toCliExitCode } from '@/core/errors.js';
import { err, isErr, ok } from '@/utils/result.js';

// Note: Testing runCommand/runResultCommand directly would require mocking process.exit.
// These tests verify the error → exit code mapping logic.

describe('command-runner exit code mapping', () => {
  describe('Result → exit code', () => {
    test('Ok with void means exit code 0 (implicit)', () => {
      const result = ok(undefined);
      expect(result.ok).toBe(true);
      // void → exit 0 (not explicitly returned)
    });

    test('Ok with number uses that exit code', () => {
      const result = ok(42);
      expect(result.ok).toBe(true);
      expect(result.value).toBe(42);
      // This would cause exit(42)
    });

    test('Err with domain error maps to exit code', () => {
      const result = err(daemonNotRunning());
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(toCliExitCode(result.error)).toBe(3);
      }
    });

    test('Err with session not found maps to exit code 4', () => {
      const result = err(sessionNotFound('missing'));
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(toCliExitCode(result.error)).toBe(4);
      }
    });
  });

  describe('error formatting', () => {
    test('daemon not running error includes hint', async () => {
      const { formatCliError } = await import('@/core/errors.js');
      const formatted = formatCliError(daemonNotRunning());
      expect(formatted).toContain('Daemon is not running');
      expect(formatted).toContain('bunterm up');
    });

    test('session not found error includes hint', async () => {
      const { formatCliError } = await import('@/core/errors.js');
      const formatted = formatCliError(sessionNotFound('test'));
      expect(formatted).toContain("Session 'test' not found");
      expect(formatted).toContain('bunterm list');
    });
  });
});
