/**
 * File-based NonceStore for persistent replay protection.
 *
 * Keeps an in-memory cache for fast lookups and periodically flushes
 * to disk so nonce state survives daemon restarts.
 *
 * File format: { "nonces": [{ "nonce": "...", "expiresAt": 1234567890 }, ...] }
 * File permissions: 0600 (owner read/write only)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { NonceStore } from './session-token.js';

interface NonceEntry {
  nonce: string;
  expiresAt: number;
}

interface NonceFileData {
  nonces: NonceEntry[];
}

export interface FileNonceStoreOptions {
  /** Maximum number of nonces to store (default: 10000) */
  maxSize?: number;
  /** Flush interval in ms (default: 5000) */
  flushIntervalMs?: number;
}

export class FileNonceStore implements NonceStore {
  private readonly cache = new Map<string, number>();
  private readonly filePath: string;
  private readonly maxSize: number;
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly flushIntervalMs: number;

  constructor(filePath: string, options: FileNonceStoreOptions = {}) {
    this.filePath = filePath;
    this.maxSize = options.maxSize ?? 10000;
    this.flushIntervalMs = options.flushIntervalMs ?? 5000;
    this.load();
  }

  async consume(jti: string, expiresAt: number): Promise<boolean> {
    if (this.cache.has(jti)) {
      return false;
    }

    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(jti, expiresAt);
    this.markDirty();
    return true;
  }

  async cleanup(): Promise<void> {
    const now = Date.now() / 1000;
    for (const [jti, exp] of this.cache) {
      if (exp < now) {
        this.cache.delete(jti);
      }
    }
    this.flush();
  }

  get size(): number {
    return this.cache.size;
  }

  dispose(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
    this.cache.clear();
  }

  private load(): void {
    if (!existsSync(this.filePath)) {
      return;
    }

    try {
      // biome-ignore lint: sync read at startup
      const content = readFileSync(this.filePath, 'utf-8');
      const data: NonceFileData = JSON.parse(content);
      if (Array.isArray(data.nonces)) {
        for (const entry of data.nonces) {
          if (typeof entry.nonce === 'string' && typeof entry.expiresAt === 'number') {
            this.cache.set(entry.nonce, entry.expiresAt);
          }
        }
      }
    } catch {
      // Corrupted file — start with empty cache
    }
  }

  private flush(): void {
    if (!this.dirty && this.cache.size === 0) {
      return;
    }

    const entries: NonceEntry[] = [];
    for (const [nonce, expiresAt] of this.cache) {
      entries.push({ nonce, expiresAt });
    }

    const data: NonceFileData = { nonces: entries };

    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    writeFileSync(this.filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
    this.dirty = false;
  }

  private markDirty(): void {
    this.dirty = true;
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) {
      return;
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, this.flushIntervalMs);
  }

  private evictOldest(): void {
    let oldestJti: string | null = null;
    let oldestExp = Number.POSITIVE_INFINITY;

    for (const [jti, exp] of this.cache) {
      if (exp < oldestExp) {
        oldestExp = exp;
        oldestJti = jti;
      }
    }

    if (oldestJti) {
      this.cache.delete(oldestJti);
    }
  }
}
