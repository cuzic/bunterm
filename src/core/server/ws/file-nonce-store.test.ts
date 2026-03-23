import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileNonceStore } from './file-nonce-store.js';

describe('FileNonceStore', () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(() => {
    tempDir = join(
      tmpdir(),
      `file-nonce-store-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(tempDir, { recursive: true });
    filePath = join(tempDir, 'nonces.json');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('consume returns true for new nonce', async () => {
    const store = new FileNonceStore(filePath);
    const result = await store.consume('nonce-1', Date.now() / 1000 + 60);
    expect(result).toBe(true);
    store.dispose();
  });

  test('consume returns false for already-used nonce', async () => {
    const store = new FileNonceStore(filePath);
    const exp = Date.now() / 1000 + 60;
    await store.consume('nonce-1', exp);
    const result = await store.consume('nonce-1', exp);
    expect(result).toBe(false);
    store.dispose();
  });

  test('consume returns true for different nonces', async () => {
    const store = new FileNonceStore(filePath);
    const exp = Date.now() / 1000 + 60;
    expect(await store.consume('nonce-1', exp)).toBe(true);
    expect(await store.consume('nonce-2', exp)).toBe(true);
    store.dispose();
  });

  test('cleanup removes expired nonces', async () => {
    const store = new FileNonceStore(filePath);
    const pastExp = Date.now() / 1000 - 10; // already expired
    const futureExp = Date.now() / 1000 + 60;

    await store.consume('expired-nonce', pastExp);
    await store.consume('valid-nonce', futureExp);

    await store.cleanup();

    // expired nonce should be cleaned up, so consume should succeed
    expect(await store.consume('expired-nonce', futureExp)).toBe(true);
    // valid nonce should still be tracked
    expect(await store.consume('valid-nonce', futureExp)).toBe(false);
    store.dispose();
  });

  test('persistence: data survives across instances', async () => {
    const store1 = new FileNonceStore(filePath);
    const exp = Date.now() / 1000 + 60;
    await store1.consume('persistent-nonce', exp);
    store1.dispose(); // flushes to disk

    const store2 = new FileNonceStore(filePath);
    // Should find the nonce from the previous instance
    const result = await store2.consume('persistent-nonce', exp);
    expect(result).toBe(false);
    store2.dispose();
  });

  test('persistence: new nonce works after reload', async () => {
    const store1 = new FileNonceStore(filePath);
    await store1.consume('nonce-1', Date.now() / 1000 + 60);
    store1.dispose();

    const store2 = new FileNonceStore(filePath);
    const result = await store2.consume('nonce-2', Date.now() / 1000 + 60);
    expect(result).toBe(true);
    store2.dispose();
  });

  test('file is created with correct permissions', async () => {
    const store = new FileNonceStore(filePath);
    await store.consume('nonce-1', Date.now() / 1000 + 60);
    store.dispose(); // triggers flush

    expect(existsSync(filePath)).toBe(true);

    // Verify JSON format
    // biome-ignore lint: test assertion
    const content = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed).toHaveProperty('nonces');
    expect(Array.isArray(parsed.nonces)).toBe(true);
    expect(parsed.nonces[0]).toHaveProperty('nonce', 'nonce-1');
    expect(parsed.nonces[0]).toHaveProperty('expiresAt');
  });

  test('handles missing file gracefully on load', async () => {
    const store = new FileNonceStore(join(tempDir, 'nonexistent.json'));
    const result = await store.consume('nonce-1', Date.now() / 1000 + 60);
    expect(result).toBe(true);
    store.dispose();
  });

  test('handles corrupted file gracefully on load', async () => {
    const corruptPath = join(tempDir, 'corrupt.json');
    Bun.write(corruptPath, 'not valid json!!!');

    const store = new FileNonceStore(corruptPath);
    const result = await store.consume('nonce-1', Date.now() / 1000 + 60);
    expect(result).toBe(true);
    store.dispose();
  });

  test('dispose cancels flush timer and performs final flush', async () => {
    const store = new FileNonceStore(filePath);
    await store.consume('nonce-1', Date.now() / 1000 + 60);

    // dispose should flush without waiting for timer
    store.dispose();

    expect(existsSync(filePath)).toBe(true);
    // biome-ignore lint: test assertion
    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(content.nonces.length).toBe(1);
  });

  test('size returns number of stored nonces', async () => {
    const store = new FileNonceStore(filePath);
    expect(store.size).toBe(0);

    await store.consume('nonce-1', Date.now() / 1000 + 60);
    expect(store.size).toBe(1);

    await store.consume('nonce-2', Date.now() / 1000 + 60);
    expect(store.size).toBe(2);

    store.dispose();
  });

  test('maxSize evicts oldest when limit reached', async () => {
    const store = new FileNonceStore(filePath, { maxSize: 2 });
    const now = Date.now() / 1000;

    await store.consume('nonce-1', now + 10); // earliest expiration
    await store.consume('nonce-2', now + 60);
    await store.consume('nonce-3', now + 30); // should evict nonce-1

    expect(store.size).toBe(2);
    // nonce-1 was evicted, so consuming it again should succeed
    expect(await store.consume('nonce-1', now + 60)).toBe(true);

    store.dispose();
  });
});
