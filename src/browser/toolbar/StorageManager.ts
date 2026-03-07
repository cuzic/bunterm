/**
 * StorageManager
 *
 * Type-safe localStorage abstraction with Zod schema validation.
 * Handles versioning, migration, and error recovery.
 */

import type { z } from 'zod';

/**
 * Storage interface (compatible with localStorage)
 */
export interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * StorageManager configuration
 */
export interface StorageManagerConfig<T> {
  /** Storage key */
  key: string;
  /** Zod schema for validation */
  schema: z.ZodType<T>;
  /** Default value when storage is empty or invalid */
  defaultValue: T;
  /** Storage implementation (defaults to localStorage) */
  storage?: Storage;
  /** Optional migration function for schema upgrades */
  migrate?: (raw: unknown) => T | null;
}

/**
 * StorageManager interface
 */
export interface StorageManager<T> {
  /** Load data from storage, returns default if invalid */
  load(): T;
  /** Save data to storage */
  save(data: T): void;
  /** Clear stored data */
  clear(): void;
  /** Update data with a transformation function */
  update(transform: (current: T) => T): void;
  /** Check if key exists in storage */
  exists(): boolean;
}

/**
 * Create a new StorageManager instance
 */
export function createStorageManager<T>(config: StorageManagerConfig<T>): StorageManager<T> {
  const { key, schema, defaultValue, storage, migrate } = config;

  // Use provided storage or try to use localStorage (for browser)
  const getStorage = (): Storage | null => {
    if (storage) {
      return storage;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
    return null;
  };

  const load = (): T => {
    const store = getStorage();
    if (!store) {
      return defaultValue;
    }

    try {
      const raw = store.getItem(key);
      if (raw === null) {
        return defaultValue;
      }

      const parsed: unknown = JSON.parse(raw);

      // Try to validate with schema first
      const result = schema.safeParse(parsed);
      if (result.success) {
        return result.data;
      }

      // If validation fails, try migration
      if (migrate) {
        const migrated = migrate(parsed);
        if (migrated !== null) {
          // Validate migrated data
          const migratedResult = schema.safeParse(migrated);
          if (migratedResult.success) {
            // Save migrated data
            save(migratedResult.data);
            return migratedResult.data;
          }
        }
      }

      // Fall back to default
      return defaultValue;
    } catch {
      // JSON parse error or other issues
      return defaultValue;
    }
  };

  const save = (data: T): void => {
    const store = getStorage();
    if (!store) {
      return;
    }

    try {
      store.setItem(key, JSON.stringify(data));
    } catch {}
  };

  const clear = (): void => {
    const store = getStorage();
    if (!store) {
      return;
    }
    store.removeItem(key);
  };

  const update = (transform: (current: T) => T): void => {
    const current = load();
    const updated = transform(current);
    save(updated);
  };

  const exists = (): boolean => {
    const store = getStorage();
    if (!store) {
      return false;
    }
    return store.getItem(key) !== null;
  };

  return {
    load,
    save,
    clear,
    update,
    exists
  };
}
