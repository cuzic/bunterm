import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { SentryConfig } from '@/core/config/types.js';
import {
  captureException,
  captureMessage,
  initSentry,
  isSentryEnabled,
  resetSentryState
} from './sentry.js';

describe('sentry', () => {
  beforeEach(() => {
    resetSentryState();
  });

  afterEach(() => {
    resetSentryState();
  });

  describe('initSentry', () => {
    test('should not initialize when disabled', async () => {
      const config: SentryConfig = {
        enabled: false,
        environment: 'test',
        sample_rate: 1.0,
        traces_sample_rate: 0.1,
        debug: false
      };

      await initSentry(config);
      expect(isSentryEnabled()).toBe(false);
    });

    test('should not initialize when DSN is not provided', async () => {
      const config: SentryConfig = {
        enabled: true,
        environment: 'test',
        sample_rate: 1.0,
        traces_sample_rate: 0.1,
        debug: false
      };

      await initSentry(config);
      expect(isSentryEnabled()).toBe(false);
    });

    test('should handle import errors gracefully', async () => {
      // Mock a scenario where @sentry/bun import fails
      // This test just ensures no exception is thrown
      const config: SentryConfig = {
        enabled: true,
        dsn: 'https://invalid@sentry.io/12345',
        environment: 'test',
        sample_rate: 1.0,
        traces_sample_rate: 0.1,
        debug: false
      };

      // Should not throw
      await initSentry(config);
      // Note: This might initialize Sentry if @sentry/bun is available
    });
  });

  describe('captureException', () => {
    test('should not throw when Sentry is not initialized', () => {
      // Should not throw even when Sentry is not initialized
      expect(() => {
        captureException(new Error('test error'));
      }).not.toThrow();
    });

    test('should accept context', () => {
      // Should not throw
      expect(() => {
        captureException(new Error('test error'), { type: 'test' });
      }).not.toThrow();
    });
  });

  describe('captureMessage', () => {
    test('should not throw when Sentry is not initialized', () => {
      // Should not throw even when Sentry is not initialized
      expect(() => {
        captureMessage('test message');
      }).not.toThrow();
    });

    test('should accept severity level', () => {
      // Should not throw
      expect(() => {
        captureMessage('warning message', 'warning');
        captureMessage('error message', 'error');
        captureMessage('info message', 'info');
        captureMessage('fatal message', 'fatal');
      }).not.toThrow();
    });
  });

  describe('isSentryEnabled', () => {
    test('should return false initially', () => {
      expect(isSentryEnabled()).toBe(false);
    });

    test('should return false after reset', () => {
      // Even if Sentry was initialized, reset should clear state
      resetSentryState();
      expect(isSentryEnabled()).toBe(false);
    });
  });
});
