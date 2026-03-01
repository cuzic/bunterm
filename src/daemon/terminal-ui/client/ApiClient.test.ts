/**
 * ToolbarApiClient Tests (TDD)
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import {
  ApiError,
  type FileInfo,
  type ImageData,
  type ToolbarApiClient,
  createApiClient
} from './ApiClient.js';

// Mock fetch for testing
const createMockFetch = () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let nextResponse: Response | Error = new Response('{}');

  const mockFetch = (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    if (nextResponse instanceof Error) {
      return Promise.reject(nextResponse);
    }
    return Promise.resolve(nextResponse);
  };

  return {
    fetch: mockFetch as typeof fetch,
    calls,
    setResponse: (response: Response | Error) => {
      nextResponse = response;
    },
    setJsonResponse: (data: unknown, status = 200) => {
      nextResponse = new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  };
};

describe('ToolbarApiClient', () => {
  let mockFetch: ReturnType<typeof createMockFetch>;
  let client: ToolbarApiClient;

  beforeEach(() => {
    mockFetch = createMockFetch();
    client = createApiClient({
      basePath: '/ttyd-mux',
      fetch: mockFetch.fetch
    });
  });

  describe('clipboard images', () => {
    test('uploadImages sends POST with base64 images', async () => {
      const images: ImageData[] = [{ data: 'base64data', mimeType: 'image/png', name: 'test.png' }];
      mockFetch.setJsonResponse({ success: true, paths: ['/tmp/test.png'] });

      const paths = await client.uploadImages('my-session', images);

      expect(paths).toEqual(['/tmp/test.png']);
      expect(mockFetch.calls.length).toBe(1);
      expect(mockFetch.calls[0].url).toBe('/ttyd-mux/api/clipboard-image?session=my-session');
      expect(mockFetch.calls[0].init?.method).toBe('POST');
    });

    test('uploadImages throws ApiError on failure', async () => {
      mockFetch.setJsonResponse({ success: false, error: 'Upload failed' }, 500);

      await expect(client.uploadImages('session', [])).rejects.toThrow(ApiError);
    });
  });

  describe('file transfer', () => {
    test('listFiles fetches file list', async () => {
      const files: FileInfo[] = [
        { name: 'test.txt', size: 100, isDirectory: false, modifiedAt: '2026-01-01' }
      ];
      mockFetch.setJsonResponse({ files });

      const result = await client.listFiles('my-session', '/home');

      expect(result).toEqual(files);
      expect(mockFetch.calls[0].url).toBe(
        '/ttyd-mux/api/files/list?session=my-session&path=%2Fhome'
      );
    });

    test('downloadFile returns blob', async () => {
      const blob = new Blob(['file content'], { type: 'text/plain' });
      mockFetch.setResponse(new Response(blob));

      const result = await client.downloadFile('my-session', '/file.txt');

      expect(result instanceof Blob).toBe(true);
      expect(mockFetch.calls[0].url).toBe(
        '/ttyd-mux/api/files/download?session=my-session&path=%2Ffile.txt'
      );
    });

    test('uploadFile sends FormData', async () => {
      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      mockFetch.setJsonResponse({ success: true, path: '/uploaded/test.txt' });

      const path = await client.uploadFile('my-session', '/dest', file);

      expect(path).toBe('/uploaded/test.txt');
      expect(mockFetch.calls[0].init?.method).toBe('POST');
      // FormData should be in body
      expect(mockFetch.calls[0].init?.body instanceof FormData).toBe(true);
    });
  });

  describe('notifications', () => {
    test('getVapidKey fetches public key', async () => {
      mockFetch.setJsonResponse({ publicKey: 'VAPID_PUBLIC_KEY_HERE' });

      const key = await client.getVapidKey();

      expect(key).toBe('VAPID_PUBLIC_KEY_HERE');
      expect(mockFetch.calls[0].url).toBe('/ttyd-mux/api/notifications/vapid-key');
    });

    test('subscribe sends subscription data', async () => {
      mockFetch.setJsonResponse({ id: 'sub-123' });

      const id = await client.subscribe({
        endpoint: 'https://push.example.com',
        keys: { p256dh: 'key1', auth: 'key2' },
        sessionName: 'my-session'
      });

      expect(id).toBe('sub-123');
      expect(mockFetch.calls[0].init?.method).toBe('POST');
      expect(mockFetch.calls[0].url).toBe('/ttyd-mux/api/notifications/subscribe');
    });

    test('unsubscribe sends DELETE request', async () => {
      mockFetch.setJsonResponse({ success: true });

      await client.unsubscribe('sub-123');

      expect(mockFetch.calls[0].init?.method).toBe('DELETE');
      expect(mockFetch.calls[0].url).toBe('/ttyd-mux/api/notifications/subscribe/sub-123');
    });
  });

  describe('share', () => {
    test('createShare sends POST with session and expiry', async () => {
      mockFetch.setJsonResponse({
        token: 'abc123',
        sessionName: 'my-session',
        expiresAt: '2026-02-20T00:00:00Z'
      });

      const share = await client.createShare('my-session', '1h');

      expect(share.token).toBe('abc123');
      expect(mockFetch.calls[0].init?.method).toBe('POST');
      expect(mockFetch.calls[0].url).toBe('/ttyd-mux/api/shares');
    });
  });

  describe('error handling', () => {
    test('ApiError contains status and message', async () => {
      mockFetch.setJsonResponse({ error: 'Not found' }, 404);

      try {
        await client.listFiles('session', '/');
        expect(true).toBe(false); // Should not reach here
      } catch (e) {
        expect(e instanceof ApiError).toBe(true);
        const error = e as ApiError;
        expect(error.status).toBe(404);
        expect(error.message).toBe('Not found');
      }
    });

    test('network error wraps in ApiError', async () => {
      mockFetch.setResponse(new Error('Network failed'));

      try {
        await client.listFiles('session', '/');
        expect(true).toBe(false);
      } catch (e) {
        expect(e instanceof ApiError).toBe(true);
        expect((e as ApiError).message).toContain('Network failed');
      }
    });
  });

  describe('request cancellation', () => {
    test('supports AbortController', async () => {
      const controller = new AbortController();
      const clientWithSignal = createApiClient({
        basePath: '/ttyd-mux',
        fetch: mockFetch.fetch,
        signal: controller.signal
      });

      mockFetch.setJsonResponse({ files: [] });

      // Should pass signal to fetch
      await clientWithSignal.listFiles('session', '/');

      expect(mockFetch.calls[0].init?.signal).toBe(controller.signal);
    });
  });

  describe('URL encoding', () => {
    test('encodes special characters in session name', async () => {
      mockFetch.setJsonResponse({ files: [] });

      await client.listFiles('my session/with spaces', '/path');

      expect(mockFetch.calls[0].url).toContain('session=my%20session%2Fwith%20spaces');
    });

    test('encodes special characters in path', async () => {
      mockFetch.setJsonResponse({ files: [] });

      await client.listFiles('session', '/path with spaces/日本語');

      expect(mockFetch.calls[0].url).toContain(
        'path=%2Fpath%20with%20spaces%2F%E6%97%A5%E6%9C%AC%E8%AA%9E'
      );
    });
  });
});
