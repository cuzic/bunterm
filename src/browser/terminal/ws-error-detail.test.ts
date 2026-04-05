/**
 * WebSocket Error Detail Tests
 *
 * Tests for the ws-error-detail utility that fetches HTTP error details
 * when a WebSocket connection fails, to provide better user-facing messages.
 */

import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import {
  buildHttpUrlFromWs,
  fetchWebSocketErrorDetail,
  formatWebSocketConnectionError,
  parseWebSocketErrorBody
} from './ws-error-detail.js';

describe('buildHttpUrlFromWs', () => {
  test('converts ws:// to http://', () => {
    const result = buildHttpUrlFromWs('ws://localhost:7680/bunterm/my-session/ws');
    expect(result).toBe('http://localhost:7680/bunterm/my-session/ws');
  });

  test('converts wss:// to https://', () => {
    const result = buildHttpUrlFromWs('wss://example.com/bunterm/session/ws');
    expect(result).toBe('https://example.com/bunterm/session/ws');
  });

  test('preserves path and port', () => {
    const result = buildHttpUrlFromWs('ws://127.0.0.1:7680/bunterm/test/ws');
    expect(result).toBe('http://127.0.0.1:7680/bunterm/test/ws');
  });

  test('handles URL with query params', () => {
    const result = buildHttpUrlFromWs('ws://localhost:7680/ws?token=abc');
    expect(result).toBe('http://localhost:7680/ws?token=abc');
  });

  test('throws on non-WebSocket URL', () => {
    expect(() => buildHttpUrlFromWs('http://localhost/ws')).toThrow();
  });
});

describe('parseWebSocketErrorBody', () => {
  test('extracts origin_not_allowed reason from Forbidden body', () => {
    const result = parseWebSocketErrorBody(403, 'Forbidden: origin_not_allowed');
    expect(result.status).toBe(403);
    expect(result.reason).toBe('origin_not_allowed');
    expect(result.hint).toContain('config.yaml');
    expect(result.hint).toContain('security.allowed_origins');
  });

  test('extracts missing_origin reason from Forbidden body', () => {
    const result = parseWebSocketErrorBody(403, 'Forbidden: missing_origin');
    expect(result.status).toBe(403);
    expect(result.reason).toBe('missing_origin');
    expect(result.hint).toContain('Origin');
    expect(result.hint).toContain('ヘッダー');
  });

  test('handles 401 Unauthorized', () => {
    const result = parseWebSocketErrorBody(401, 'Unauthorized: Token required');
    expect(result.status).toBe(401);
    expect(result.hint).toContain('認証');
  });

  test('handles 404 Not Found', () => {
    const result = parseWebSocketErrorBody(404, 'Not Found');
    expect(result.status).toBe(404);
    expect(result.hint).toContain('セッション');
  });

  test('handles 500 Internal Server Error', () => {
    const result = parseWebSocketErrorBody(500, 'Internal Server Error');
    expect(result.status).toBe(500);
    expect(typeof result.hint).toBe('string');
    expect(result.hint.length).toBeGreaterThan(0);
  });

  test('handles unknown body format gracefully', () => {
    const result = parseWebSocketErrorBody(403, 'some unexpected message');
    expect(result.status).toBe(403);
    expect(typeof result.hint).toBe('string');
    expect(result.hint.length).toBeGreaterThan(0);
  });

  test('handles empty body', () => {
    const result = parseWebSocketErrorBody(403, '');
    expect(result.status).toBe(403);
    expect(typeof result.hint).toBe('string');
  });
});

describe('formatWebSocketConnectionError', () => {
  test('formats origin_not_allowed error with status code', () => {
    const message = formatWebSocketConnectionError({
      status: 403,
      reason: 'origin_not_allowed',
      hint: 'Origin が許可されていません。config.yaml の security.allowed_origins を確認してください'
    });
    expect(message).toContain('403');
    expect(message).toContain('Origin');
    expect(message).toContain('config.yaml');
  });

  test('formats missing_origin error with status code', () => {
    const message = formatWebSocketConnectionError({
      status: 403,
      reason: 'missing_origin',
      hint: 'Origin ヘッダーがありません'
    });
    expect(message).toContain('403');
    expect(message).toContain('Origin');
    expect(message).toContain('ヘッダー');
  });

  test('returns non-empty string for any input', () => {
    const message = formatWebSocketConnectionError({
      status: 503,
      reason: undefined,
      hint: 'サービス利用不可'
    });
    expect(typeof message).toBe('string');
    expect(message.length).toBeGreaterThan(0);
  });

  test('includes the hint text in the formatted message', () => {
    const hint = '接続に失敗しました。設定を確認してください。';
    const message = formatWebSocketConnectionError({ status: 403, reason: undefined, hint });
    expect(message).toContain(hint);
  });

  test('message does not contain "undefined"', () => {
    const message = formatWebSocketConnectionError({
      status: 403,
      reason: undefined,
      hint: 'some hint'
    });
    expect(message).not.toContain('undefined');
  });
});

describe('parseWebSocketErrorBody - additional status codes', () => {
  test('handles 503 Service Unavailable (>= 500)', () => {
    const result = parseWebSocketErrorBody(503, 'Service Unavailable');
    expect(result.status).toBe(503);
    expect(result.hint).toContain('503');
    expect(result.hint).toContain('サーバーエラー');
  });

  test('handles 502 Bad Gateway (>= 500)', () => {
    const result = parseWebSocketErrorBody(502, 'Bad Gateway');
    expect(result.status).toBe(502);
    expect(result.hint).toContain('502');
  });

  test('handles 429 Too Many Requests (non-standard)', () => {
    const result = parseWebSocketErrorBody(429, 'Too Many Requests');
    expect(result.status).toBe(429);
    expect(typeof result.hint).toBe('string');
    expect(result.hint.length).toBeGreaterThan(0);
    expect(result.hint).not.toContain('undefined');
  });

  test('reason is undefined when body has no colon-separated code', () => {
    const result = parseWebSocketErrorBody(403, 'Access denied');
    expect(result.reason).toBeUndefined();
    expect(result.hint).toContain('403');
  });
});

describe('fetchWebSocketErrorDetail', () => {
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    fetchSpy = spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test('returns parsed detail for a 403 origin_not_allowed response', async () => {
    fetchSpy.mockResolvedValue(new Response('Forbidden: origin_not_allowed', { status: 403 }));

    const detail = await fetchWebSocketErrorDetail('ws://localhost:7680/bunterm/session/ws');
    expect(detail.status).toBe(403);
    expect(detail.reason).toBe('origin_not_allowed');
    expect(detail.hint).toContain('config.yaml');
    expect(detail.hint).toContain('security.allowed_origins');
  });

  test('returns parsed detail for a 403 missing_origin response', async () => {
    fetchSpy.mockResolvedValue(new Response('Forbidden: missing_origin', { status: 403 }));

    const detail = await fetchWebSocketErrorDetail('ws://localhost:7680/bunterm/session/ws');
    expect(detail.status).toBe(403);
    expect(detail.reason).toBe('missing_origin');
    expect(detail.hint).toContain('Origin');
    expect(detail.hint).toContain('ヘッダー');
  });

  test('returns parsed detail for a 401 response', async () => {
    fetchSpy.mockResolvedValue(new Response('Unauthorized: Token required', { status: 401 }));

    const detail = await fetchWebSocketErrorDetail('ws://localhost:7680/bunterm/session/ws');
    expect(detail.status).toBe(401);
    expect(detail.hint).toContain('認証');
  });

  test('returns fallback detail when fetch throws a network error', async () => {
    fetchSpy.mockRejectedValue(new Error('Network failure'));

    const detail = await fetchWebSocketErrorDetail('ws://localhost:7680/bunterm/session/ws');
    expect(detail.status).toBe(0);
    expect(typeof detail.hint).toBe('string');
    expect(detail.hint.length).toBeGreaterThan(0);
    expect(detail.hint).not.toContain('undefined');
  });

  test('returns fallback detail for non-WebSocket URL input', async () => {
    const detail = await fetchWebSocketErrorDetail('http://localhost/ws');
    expect(detail.status).toBe(0);
    expect(typeof detail.hint).toBe('string');
  });

  test('converts wss:// to https:// when fetching', async () => {
    fetchSpy.mockResolvedValue(new Response('Forbidden: origin_not_allowed', { status: 403 }));

    await fetchWebSocketErrorDetail('wss://example.com/bunterm/session/ws');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com/bunterm/session/ws',
      expect.objectContaining({ method: 'GET' })
    );
  });
});
