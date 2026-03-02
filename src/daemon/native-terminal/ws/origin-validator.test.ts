/**
 * Origin Validator Tests
 */

import { describe, expect, test } from 'bun:test';
import { createSecurityConfig, validateOrigin } from './origin-validator.js';

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

  test('rejects missing origin in production mode', () => {
    const config = createSecurityConfig({
      devMode: false,
      allowedOrigins: []
    });

    const req = new Request('http://localhost:7680/ws');

    const result = validateOrigin(req, config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('missing_origin');
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
