import { afterEach, describe, expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadConfig } from '@/config/config.js';
import { handleRequest, resetAllCaches, setSecurityHeaders } from './router.js';
import { generateEtag, staticFiles } from './static-file-server.js';

// Get default config for tests
const defaultConfig = loadConfig();

// Mock ServerResponse for testing
class MockResponse extends EventEmitter {
  statusCode = 200;
  headers: Record<string, string | number> = {};
  body = '';
  ended = false;

  setHeader(name: string, value: string | number): void {
    this.headers[name.toLowerCase()] = value;
  }

  writeHead(statusCode: number, headers?: Record<string, string | number>): void {
    this.statusCode = statusCode;
    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        this.headers[key.toLowerCase()] = value;
      }
    }
  }

  end(body?: string | Buffer): void {
    if (body) {
      this.body = typeof body === 'string' ? body : body.toString();
    }
    this.ended = true;
  }

  getHeader(name: string): string | number | undefined {
    return this.headers[name.toLowerCase()];
  }
}

// Mock IncomingMessage for testing
function createMockRequest(options: {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
}): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.url = options.url ?? '/';
  req.method = options.method ?? 'GET';
  req.headers = options.headers ?? {};
  return req;
}

describe('generateEtag', () => {
  test('generates ETag with quotes', () => {
    const etag = generateEtag('test content');
    expect(etag.startsWith('"')).toBe(true);
    expect(etag.endsWith('"')).toBe(true);
  });

  test('generates consistent ETag for same content', () => {
    const etag1 = generateEtag('hello world');
    const etag2 = generateEtag('hello world');
    expect(etag1).toBe(etag2);
  });

  test('generates different ETag for different content', () => {
    const etag1 = generateEtag('content A');
    const etag2 = generateEtag('content B');
    expect(etag1).not.toBe(etag2);
  });

  test('generates valid MD5 hash format', () => {
    const etag = generateEtag('test');
    // MD5 hash is 32 hex characters, plus 2 quotes = 34 characters
    expect(etag.length).toBe(34);
    // Content between quotes should be hex
    const hash = etag.slice(1, -1);
    expect(/^[a-f0-9]{32}$/.test(hash)).toBe(true);
  });

  test('handles empty string', () => {
    const etag = generateEtag('');
    expect(etag.length).toBe(34);
  });

  test('handles unicode content', () => {
    const etag = generateEtag('日本語コンテンツ');
    expect(etag.length).toBe(34);
  });
});

describe('setSecurityHeaders', () => {
  test('sets X-Content-Type-Options', () => {
    const res = new MockResponse() as unknown as ServerResponse;
    setSecurityHeaders(res);
    expect(res.getHeader('X-Content-Type-Options')).toBe('nosniff');
  });

  test('sets X-Frame-Options', () => {
    const res = new MockResponse() as unknown as ServerResponse;
    setSecurityHeaders(res);
    expect(res.getHeader('X-Frame-Options')).toBe('SAMEORIGIN');
  });

  test('sets Content-Security-Policy', () => {
    const res = new MockResponse() as unknown as ServerResponse;
    setSecurityHeaders(res);
    expect(res.getHeader('Content-Security-Policy')).toBeDefined();
  });

  test('sets Permissions-Policy', () => {
    const res = new MockResponse() as unknown as ServerResponse;
    setSecurityHeaders(res);
    expect(res.getHeader('Permissions-Policy')).toBeDefined();
  });

  test('sets Referrer-Policy', () => {
    const res = new MockResponse() as unknown as ServerResponse;
    setSecurityHeaders(res);
    expect(res.getHeader('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });
});

describe('handleRequest - terminal-ui.js', () => {
  afterEach(() => {
    staticFiles.terminalUi.reset();
  });

  test('returns 200 with ETag on first request', () => {
    const req = createMockRequest({ url: '/ttyd-mux/terminal-ui.js' });
    const res = new MockResponse();

    handleRequest(defaultConfig, req, res as unknown as ServerResponse);

    expect(res.statusCode).toBe(200);
    expect(res.headers.etag).toBeDefined();
    expect(res.headers['content-type']).toBe('application/javascript');
    expect(res.headers['cache-control']).toBe('public, max-age=0, must-revalidate');
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('returns 304 when If-None-Match matches ETag', () => {
    // First request to get the ETag
    const req1 = createMockRequest({ url: '/ttyd-mux/terminal-ui.js' });
    const res1 = new MockResponse();
    handleRequest(defaultConfig, req1, res1 as unknown as ServerResponse);
    const etag = res1.headers.etag as string;

    // Second request with If-None-Match
    const req2 = createMockRequest({
      url: '/ttyd-mux/terminal-ui.js',
      headers: { 'if-none-match': etag }
    });
    const res2 = new MockResponse();
    handleRequest(defaultConfig, req2, res2 as unknown as ServerResponse);

    expect(res2.statusCode).toBe(304);
    expect(res2.headers.etag).toBe(etag);
    expect(res2.body).toBe(''); // No body for 304
  });

  test('returns 200 when If-None-Match does not match', () => {
    const req = createMockRequest({
      url: '/ttyd-mux/terminal-ui.js',
      headers: { 'if-none-match': '"different-etag"' }
    });
    const res = new MockResponse();

    handleRequest(defaultConfig, req, res as unknown as ServerResponse);

    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('ETag is consistent across requests', () => {
    const req1 = createMockRequest({ url: '/ttyd-mux/terminal-ui.js' });
    const res1 = new MockResponse();
    handleRequest(defaultConfig, req1, res1 as unknown as ServerResponse);

    const req2 = createMockRequest({ url: '/ttyd-mux/terminal-ui.js' });
    const res2 = new MockResponse();
    handleRequest(defaultConfig, req2, res2 as unknown as ServerResponse);

    expect(res1.headers.etag).toBe(res2.headers.etag);
  });

  test('includes must-revalidate in Cache-Control', () => {
    const req = createMockRequest({ url: '/ttyd-mux/terminal-ui.js' });
    const res = new MockResponse();

    handleRequest(defaultConfig, req, res as unknown as ServerResponse);

    expect(res.headers['cache-control']).toContain('must-revalidate');
    expect(res.headers['cache-control']).toContain('max-age=0');
  });
});

describe('handleRequest - portal', () => {
  test('serves portal page at base path', () => {
    const req = createMockRequest({ url: '/ttyd-mux/' });
    const res = new MockResponse();

    handleRequest(defaultConfig, req, res as unknown as ServerResponse);

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res.body).toContain('ttyd-mux');
  });

  test('returns 404 for unknown path', () => {
    const req = createMockRequest({ url: '/ttyd-mux/unknown-path' });
    const res = new MockResponse();

    handleRequest(defaultConfig, req, res as unknown as ServerResponse);

    expect(res.statusCode).toBe(404);
  });
});
