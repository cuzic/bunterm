/**
 * Origin Validator Tests
 */

import { describe, expect, test } from 'bun:test';
import { createSecurityConfig, getWebSocketErrorHint, validateOrigin } from './origin-validator.js';

describe('validateOrigin', () => {
  test('allows origin in allowlist', () => {
    const config = createSecurityConfig({
      allowedOrigins: ['https://example.com', 'https://app.example.com']
    });

    const req = new Request('http://localhost:7680/ws', {
      headers: { Origin: 'https://example.com' }
    });

    const result = validateOrigin(req, config);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('allowlist_match');
  });

  test('rejects origin not in allowlist', () => {
    const config = createSecurityConfig({
      allowedOrigins: ['https://example.com']
    });

    const req = new Request('http://localhost:7680/ws', {
      headers: { Origin: 'https://malicious.com' }
    });

    const result = validateOrigin(req, config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('origin_not_allowed');
  });

  test('allows missing origin from localhost (CLI clients)', () => {
    const config = createSecurityConfig({
      devMode: false,
      allowedOrigins: []
    });

    const req = new Request('http://localhost:7680/ws');

    const result = validateOrigin(req, config);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('dev_mode_localhost');
  });

  test('allows localhost without origin in dev mode', () => {
    const config = createSecurityConfig({
      devMode: true,
      allowedOrigins: []
    });

    const req = new Request('http://localhost:7680/ws');

    const result = validateOrigin(req, config);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('dev_mode_localhost');
  });

  test('allows localhost origin in dev mode', () => {
    const config = createSecurityConfig({
      devMode: true,
      allowedOrigins: []
    });

    const req = new Request('http://localhost:7680/ws', {
      headers: { Origin: 'http://localhost:3000' }
    });

    const result = validateOrigin(req, config);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('dev_mode_localhost');
  });

  test('normalizes origin URLs for comparison', () => {
    const config = createSecurityConfig({
      allowedOrigins: ['https://Example.COM/']
    });

    const req = new Request('http://localhost:7680/ws', {
      headers: { Origin: 'https://example.com' }
    });

    const result = validateOrigin(req, config);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('allowlist_match');
  });

  test('handles IPv6 localhost in dev mode', () => {
    const config = createSecurityConfig({
      devMode: true,
      allowedOrigins: []
    });

    const req = new Request('http://[::1]:7680/ws');

    const result = validateOrigin(req, config);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('dev_mode_localhost');
  });
});

describe('createSecurityConfig - hostname auto-detection', () => {
  test('adds https://{hostname} to allowedOrigins when hostname is set', () => {
    const config = createSecurityConfig({
      hostname: 'myserver.example.com'
    });

    expect(config.allowedOrigins).toContain('https://myserver.example.com');
  });

  test('allows WebSocket from hostname-derived origin', () => {
    const config = createSecurityConfig({
      hostname: 'myserver.example.com'
    });

    const req = new Request('http://localhost:7680/ws', {
      headers: { Origin: 'https://myserver.example.com' }
    });

    const result = validateOrigin(req, config);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('allowlist_match');
  });

  test('merges hostname-derived origin with manual allowed_origins', () => {
    const config = createSecurityConfig({
      hostname: 'myserver.example.com',
      allowedOrigins: ['https://other.example.com']
    });

    expect(config.allowedOrigins).toContain('https://myserver.example.com');
    expect(config.allowedOrigins).toContain('https://other.example.com');
    expect(config.allowedOrigins).toHaveLength(2);
  });

  test('does not duplicate hostname origin if already in allowedOrigins', () => {
    const config = createSecurityConfig({
      hostname: 'myserver.example.com',
      allowedOrigins: ['https://myserver.example.com']
    });

    const hostnameOriginCount = config.allowedOrigins.filter(
      (o) => o === 'https://myserver.example.com'
    ).length;
    expect(hostnameOriginCount).toBe(1);
  });

  test('does not add any auto-origin when hostname is not set', () => {
    const config = createSecurityConfig({
      allowedOrigins: ['https://explicit.example.com']
    });

    expect(config.allowedOrigins).toEqual(['https://explicit.example.com']);
  });

  test('returns empty allowedOrigins when neither hostname nor allowedOrigins are set', () => {
    const config = createSecurityConfig({});

    expect(config.allowedOrigins).toEqual([]);
  });

  test('rejects origin from different hostname even when hostname is set', () => {
    const config = createSecurityConfig({
      hostname: 'myserver.example.com'
    });

    const req = new Request('http://localhost:7680/ws', {
      headers: { Origin: 'https://attacker.example.com' }
    });

    const result = validateOrigin(req, config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('origin_not_allowed');
  });
});

describe('getWebSocketErrorHint', () => {
  test('returns origin_not_allowed hint with config.yaml guidance', () => {
    const hint = getWebSocketErrorHint('origin_not_allowed');
    expect(hint).toContain('Origin');
    expect(hint).toContain('config.yaml');
    expect(hint).toContain('security.allowed_origins');
  });

  test('returns missing_origin hint', () => {
    const hint = getWebSocketErrorHint('missing_origin');
    expect(hint).toContain('Origin');
    expect(hint).toContain('ヘッダー');
  });

  test('returns generic hint for unknown error codes', () => {
    const hint = getWebSocketErrorHint('unknown_reason' as 'origin_not_allowed');
    expect(typeof hint).toBe('string');
    expect(hint.length).toBeGreaterThan(0);
  });

  test('returns different hints for origin_not_allowed vs missing_origin', () => {
    const notAllowed = getWebSocketErrorHint('origin_not_allowed');
    const missing = getWebSocketErrorHint('missing_origin');
    expect(notAllowed).not.toBe(missing);
  });

  test('hint for origin_not_allowed mentions allowed_origins config key', () => {
    const hint = getWebSocketErrorHint('origin_not_allowed');
    expect(hint).toMatch(/allowed_origins/);
  });

  test('returns a string for allowlist_match reason (informational)', () => {
    const hint = getWebSocketErrorHint('allowlist_match');
    expect(typeof hint).toBe('string');
  });

  test('returns a string for dev_mode_localhost reason (informational)', () => {
    const hint = getWebSocketErrorHint('dev_mode_localhost');
    expect(typeof hint).toBe('string');
  });
});
