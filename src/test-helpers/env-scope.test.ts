import { describe, expect, test } from 'bun:test';
import { withEnv, withEnvSync } from './env-scope.js';

describe('withEnv', () => {
  test('sets env vars during callback', async () => {
    const key = 'WITHENV_TEST_SET';
    delete process.env[key];

    await withEnv({ [key]: 'hello' }, () => {
      expect(process.env[key]).toBe('hello');
    });
  });

  test('restores original value after callback', async () => {
    const key = 'WITHENV_TEST_RESTORE';
    process.env[key] = 'original';

    await withEnv({ [key]: 'overridden' }, () => {
      expect(process.env[key]).toBe('overridden');
    });

    expect(process.env[key]).toBe('original');
    delete process.env[key];
  });

  test('deletes env var if it was originally undefined', async () => {
    const key = 'WITHENV_TEST_DELETE';
    delete process.env[key];

    await withEnv({ [key]: 'temporary' }, () => {
      expect(process.env[key]).toBe('temporary');
    });

    expect(process.env[key]).toBeUndefined();
  });

  test('restores on exception', async () => {
    const key = 'WITHENV_TEST_EXCEPTION';
    process.env[key] = 'safe';

    try {
      await withEnv({ [key]: 'danger' }, () => {
        throw new Error('boom');
      });
    } catch {
      // expected
    }

    expect(process.env[key]).toBe('safe');
    delete process.env[key];
  });

  test('handles multiple keys', async () => {
    const key1 = 'WITHENV_MULTI_1';
    const key2 = 'WITHENV_MULTI_2';
    process.env[key1] = 'a';
    delete process.env[key2];

    await withEnv({ [key1]: 'x', [key2]: 'y' }, () => {
      expect(process.env[key1]).toBe('x');
      expect(process.env[key2]).toBe('y');
    });

    expect(process.env[key1]).toBe('a');
    expect(process.env[key2]).toBeUndefined();
    delete process.env[key1];
  });

  test('supports async callbacks', async () => {
    const key = 'WITHENV_ASYNC';
    delete process.env[key];

    const result = await withEnv({ [key]: 'async-val' }, async () => {
      await new Promise((r) => setTimeout(r, 10));
      return process.env[key];
    });

    expect(result).toBe('async-val');
    expect(process.env[key]).toBeUndefined();
  });

  test('returns callback return value', async () => {
    const result = await withEnv({ WITHENV_RET: 'v' }, () => 42);
    expect(result).toBe(42);
    delete process.env['WITHENV_RET'];
  });
});

describe('withEnvSync', () => {
  test('sets and restores env vars synchronously', () => {
    const key = 'WITHENV_SYNC';
    process.env[key] = 'before';

    const result = withEnvSync({ [key]: 'during' }, () => {
      expect(process.env[key]).toBe('during');
      return 'done';
    });

    expect(result).toBe('done');
    expect(process.env[key]).toBe('before');
    delete process.env[key];
  });

  test('restores on exception synchronously', () => {
    const key = 'WITHENV_SYNC_ERR';
    delete process.env[key];

    try {
      withEnvSync({ [key]: 'temp' }, () => {
        throw new Error('sync boom');
      });
    } catch {
      // expected
    }

    expect(process.env[key]).toBeUndefined();
  });
});
