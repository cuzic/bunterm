/**
 * StorageManager Tests (TDD)
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { createStorageManager } from './StorageManager.js';

// Mock localStorage for testing
const createMockStorage = () => {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const key of Object.keys(store)) {
        delete store[key];
      }
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] ?? null
  };
};

describe('StorageManager', () => {
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    mockStorage = createMockStorage();
  });

  describe('basic operations', () => {
    const TestSchema = z.object({
      name: z.string(),
      count: z.number()
    });
    type TestData = z.infer<typeof TestSchema>;

    test('load returns default value when storage is empty', () => {
      const defaultValue: TestData = { name: 'default', count: 0 };
      const manager = createStorageManager({
        key: 'test-key',
        schema: TestSchema,
        defaultValue,
        storage: mockStorage
      });

      expect(manager.load()).toEqual(defaultValue);
    });

    test('save and load roundtrip works', () => {
      const defaultValue: TestData = { name: 'default', count: 0 };
      const manager = createStorageManager({
        key: 'test-key',
        schema: TestSchema,
        defaultValue,
        storage: mockStorage
      });

      const newData: TestData = { name: 'test', count: 42 };
      manager.save(newData);

      expect(manager.load()).toEqual(newData);
    });

    test('clear removes stored data', () => {
      const defaultValue: TestData = { name: 'default', count: 0 };
      const manager = createStorageManager({
        key: 'test-key',
        schema: TestSchema,
        defaultValue,
        storage: mockStorage
      });

      manager.save({ name: 'test', count: 42 });
      manager.clear();

      expect(manager.load()).toEqual(defaultValue);
    });
  });

  describe('schema validation', () => {
    const StrictSchema = z.object({
      id: z.string().min(1),
      value: z.number().positive()
    });

    test('load returns default when stored data is invalid', () => {
      const defaultValue = { id: 'default', value: 1 };
      mockStorage.setItem('test-key', JSON.stringify({ id: '', value: -1 }));

      const manager = createStorageManager({
        key: 'test-key',
        schema: StrictSchema,
        defaultValue,
        storage: mockStorage
      });

      expect(manager.load()).toEqual(defaultValue);
    });

    test('load returns default when JSON is malformed', () => {
      const defaultValue = { id: 'default', value: 1 };
      mockStorage.setItem('test-key', 'not valid json');

      const manager = createStorageManager({
        key: 'test-key',
        schema: StrictSchema,
        defaultValue,
        storage: mockStorage
      });

      expect(manager.load()).toEqual(defaultValue);
    });

    test('load returns default when data structure is wrong', () => {
      const defaultValue = { id: 'default', value: 1 };
      mockStorage.setItem('test-key', JSON.stringify({ wrong: 'structure' }));

      const manager = createStorageManager({
        key: 'test-key',
        schema: StrictSchema,
        defaultValue,
        storage: mockStorage
      });

      expect(manager.load()).toEqual(defaultValue);
    });
  });

  describe('versioning', () => {
    const _V1Schema = z.object({
      version: z.literal(1),
      items: z.array(z.string())
    });

    const V2Schema = z.object({
      version: z.literal(2),
      items: z.array(z.object({ id: z.string(), text: z.string() }))
    });

    test('returns default when version mismatch', () => {
      const v1Data = { version: 1, items: ['a', 'b'] };
      mockStorage.setItem('test-key', JSON.stringify(v1Data));

      const defaultValue = { version: 2 as const, items: [] };
      const manager = createStorageManager({
        key: 'test-key',
        schema: V2Schema,
        defaultValue,
        storage: mockStorage
      });

      expect(manager.load()).toEqual(defaultValue);
    });

    test('loads data when version matches', () => {
      const v2Data = {
        version: 2,
        items: [{ id: '1', text: 'hello' }]
      };
      mockStorage.setItem('test-key', JSON.stringify(v2Data));

      const defaultValue = { version: 2 as const, items: [] };
      const manager = createStorageManager({
        key: 'test-key',
        schema: V2Schema,
        defaultValue,
        storage: mockStorage
      });

      expect(manager.load()).toEqual(v2Data);
    });
  });

  describe('migration support', () => {
    const OldSchema = z.object({
      version: z.literal(1),
      data: z.string()
    });

    const NewSchema = z.object({
      version: z.literal(2),
      data: z.string(),
      timestamp: z.string()
    });

    test('migrate function transforms old data', () => {
      const oldData = { version: 1, data: 'test' };
      mockStorage.setItem('test-key', JSON.stringify(oldData));

      const defaultValue = { version: 2 as const, data: '', timestamp: '' };
      const manager = createStorageManager({
        key: 'test-key',
        schema: NewSchema,
        defaultValue,
        storage: mockStorage,
        migrate: (raw: unknown) => {
          const old = OldSchema.safeParse(raw);
          if (old.success) {
            return {
              version: 2 as const,
              data: old.data.data,
              timestamp: new Date().toISOString()
            };
          }
          return null;
        }
      });

      const loaded = manager.load();
      expect(loaded.version).toBe(2);
      expect(loaded.data).toBe('test');
      expect(loaded.timestamp).toBeDefined();
    });

    test('migrate returns null falls back to default', () => {
      mockStorage.setItem('test-key', JSON.stringify({ unknown: 'format' }));

      const defaultValue = { version: 2 as const, data: '', timestamp: '' };
      const manager = createStorageManager({
        key: 'test-key',
        schema: NewSchema,
        defaultValue,
        storage: mockStorage,
        migrate: () => null
      });

      expect(manager.load()).toEqual(defaultValue);
    });
  });

  describe('update helper', () => {
    const CounterSchema = z.object({
      count: z.number()
    });

    test('update applies transformation and saves', () => {
      const defaultValue = { count: 0 };
      const manager = createStorageManager({
        key: 'test-key',
        schema: CounterSchema,
        defaultValue,
        storage: mockStorage
      });

      manager.update((data) => ({ count: data.count + 1 }));
      expect(manager.load()).toEqual({ count: 1 });

      manager.update((data) => ({ count: data.count + 10 }));
      expect(manager.load()).toEqual({ count: 11 });
    });
  });

  describe('exists check', () => {
    const SimpleSchema = z.object({ value: z.number() });

    test('exists returns false when key not in storage', () => {
      const manager = createStorageManager({
        key: 'test-key',
        schema: SimpleSchema,
        defaultValue: { value: 0 },
        storage: mockStorage
      });

      expect(manager.exists()).toBe(false);
    });

    test('exists returns true after save', () => {
      const manager = createStorageManager({
        key: 'test-key',
        schema: SimpleSchema,
        defaultValue: { value: 0 },
        storage: mockStorage
      });

      manager.save({ value: 42 });
      expect(manager.exists()).toBe(true);
    });

    test('exists returns false after clear', () => {
      const manager = createStorageManager({
        key: 'test-key',
        schema: SimpleSchema,
        defaultValue: { value: 0 },
        storage: mockStorage
      });

      manager.save({ value: 42 });
      manager.clear();
      expect(manager.exists()).toBe(false);
    });
  });
});
