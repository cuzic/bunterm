import { describe, expect, test } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { app } from './elysia-spike.js';

// RED phase: these tests will fail because elysia-spike.ts does not exist yet.

describe('elysia-spike', () => {
  describe('GET /api/health', () => {
    test('returns { status: "ok" } with HTTP 200', async () => {
      const client = treaty(app);
      const { data, error, status } = await client.api.health.get();

      expect(error).toBeNull();
      expect(status).toBe(200);
      expect(data).toEqual({ status: 'ok' });
    });

    test('Eden Treaty infers the response type without manual annotation', async () => {
      const client = treaty(app);
      const { data } = await client.api.health.get();

      // TypeScript would error here if `status` were not on the inferred type.
      // At runtime we verify the value is a string (not undefined / unknown).
      expect(typeof data?.status).toBe('string');
    });

    test('data.status is exactly "ok"', async () => {
      const client = treaty(app);
      const { data } = await client.api.health.get();

      expect(data?.status).toBe('ok');
    });

    test('calling the endpoint twice returns consistent results', async () => {
      const client = treaty(app);

      const first = await client.api.health.get();
      const second = await client.api.health.get();

      expect(first.data?.status).toBe('ok');
      expect(second.data?.status).toBe('ok');
      expect(first.data).toEqual(second.data);
    });
  });

  describe('app instance', () => {
    test('app is exported as a named export', async () => {
      // The import at the top of the file will throw a module-not-found error
      // during RED phase, which is the expected failure signal.
      expect(app).toBeDefined();
    });

    test('app exposes route metadata consumable by Eden Treaty', () => {
      // Elysia instances carry route definitions that Eden uses for type
      // inference.  Accessing .routes confirms the instance is a real Elysia
      // app and not a plain object.
      expect(typeof (app as { routes?: unknown }).routes).toBe('object');
    });
  });
});
