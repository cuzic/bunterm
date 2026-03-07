/**
 * Session Token Tests
 */

import { afterEach, describe, expect, test } from 'bun:test';
import {
  InMemoryNonceStore,
  TokenGenerator,
  createBearerProtocol,
  extractBearerToken,
  resetTokenGenerator
} from './session-token.js';

describe('InMemoryNonceStore', () => {
  test('consumes a nonce once', async () => {
    const store = new InMemoryNonceStore();
    const expiresAt = Math.floor(Date.now() / 1000) + 60;

    const first = await store.consume('test-jti', expiresAt);
    expect(first).toBe(true);

    const second = await store.consume('test-jti', expiresAt);
    expect(second).toBe(false);

    store.dispose();
  });

  test('cleans up expired nonces', async () => {
    const store = new InMemoryNonceStore({ cleanupIntervalMs: 100000 });
    const expiredAt = Math.floor(Date.now() / 1000) - 10;

    await store.consume('expired-jti', expiredAt);
    expect(store.size).toBe(1);

    await store.cleanup();
    expect(store.size).toBe(0);

    store.dispose();
  });

  test('evicts oldest when at max size', async () => {
    const store = new InMemoryNonceStore({ maxSize: 3 });
    const now = Math.floor(Date.now() / 1000);

    await store.consume('jti1', now + 100);
    await store.consume('jti2', now + 50); // Oldest
    await store.consume('jti3', now + 150);
    expect(store.size).toBe(3);

    // Adding 4th should evict jti2 (oldest expiration)
    await store.consume('jti4', now + 200);
    expect(store.size).toBe(3);

    // jti2 should be gone, can be reused
    const canReuseJti2 = await store.consume('jti2', now + 300);
    expect(canReuseJti2).toBe(true);

    store.dispose();
  });
});

describe('TokenGenerator', () => {
  afterEach(() => {
    resetTokenGenerator();
  });

  test('generates valid tokens', async () => {
    const nonceStore = new InMemoryNonceStore();
    const generator = new TokenGenerator({
      secret: 'test-secret-32-bytes-long-here!',
      nonceStore
    });

    const token = generator.generate('my-session', 'user-123');
    expect(token).toMatch(/^[\w-]+\.[\w-]+$/);

    const validation = await generator.validate(token);
    expect(validation.valid).toBe(true);
    expect(validation.session?.sid).toBe('my-session');
    expect(validation.session?.uid).toBe('user-123');

    nonceStore.dispose();
  });

  test('rejects invalid signature', async () => {
    const nonceStore = new InMemoryNonceStore();
    const generator = new TokenGenerator({
      secret: 'test-secret-32-bytes-long-here!',
      nonceStore
    });

    const token = generator.generate('my-session');
    const [payload] = token.split('.');
    const tamperedToken = `${payload}.invalid_signature`;

    const validation = await generator.validate(tamperedToken);
    expect(validation.valid).toBe(false);
    expect(validation.error).toBe('invalid_signature');

    nonceStore.dispose();
  });

  test('rejects expired tokens', async () => {
    const nonceStore = new InMemoryNonceStore();
    const generator = new TokenGenerator({
      secret: 'test-secret-32-bytes-long-here!',
      ttlSeconds: -10, // Already expired
      nonceStore
    });

    const token = generator.generate('my-session');

    const validation = await generator.validate(token);
    expect(validation.valid).toBe(false);
    expect(validation.error).toBe('expired');

    nonceStore.dispose();
  });

  test('rejects nonce reuse', async () => {
    const nonceStore = new InMemoryNonceStore();
    const generator = new TokenGenerator({
      secret: 'test-secret-32-bytes-long-here!',
      nonceStore
    });

    const token = generator.generate('my-session');

    // First validation consumes the nonce
    const first = await generator.validate(token);
    expect(first.valid).toBe(true);

    // Second validation should fail
    const second = await generator.validate(token);
    expect(second.valid).toBe(false);
    expect(second.error).toBe('nonce_reused');

    nonceStore.dispose();
  });

  test('rejects malformed tokens', async () => {
    const nonceStore = new InMemoryNonceStore();
    const generator = new TokenGenerator({
      secret: 'test-secret-32-bytes-long-here!',
      nonceStore
    });

    const validation = await generator.validate('invalid-token');
    expect(validation.valid).toBe(false);
    expect(validation.error).toBe('invalid_format');

    nonceStore.dispose();
  });
});

describe('extractBearerToken', () => {
  test('extracts token from bearer protocol', () => {
    const token = extractBearerToken('bearer.abc123xyz');
    expect(token).toBe('abc123xyz');
  });

  test('extracts from multiple protocols', () => {
    const token = extractBearerToken('terminal, bearer.mytoken, other');
    expect(token).toBe('mytoken');
  });

  test('returns null when no bearer protocol', () => {
    const token = extractBearerToken('terminal, other');
    expect(token).toBeNull();
  });

  test('returns null for null input', () => {
    const token = extractBearerToken(null);
    expect(token).toBeNull();
  });
});

describe('createBearerProtocol', () => {
  test('creates bearer protocol string', () => {
    const protocol = createBearerProtocol('mytoken');
    expect(protocol).toBe('bearer.mytoken');
  });
});
