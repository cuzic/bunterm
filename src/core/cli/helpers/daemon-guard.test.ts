import { describe, expect, test } from 'bun:test';

// Note: Full integration tests would require mocking isDaemonRunning.

describe('daemon-guard', () => {
  describe('guardDaemon', () => {
    test('exports function', async () => {
      const { guardDaemon } = await import('./daemon-guard.js');
      expect(typeof guardDaemon).toBe('function');
    });
  });
});
