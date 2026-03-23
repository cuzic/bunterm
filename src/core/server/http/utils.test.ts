import { describe, expect, test } from 'bun:test';
import { daemonNotRunning, pathTraversal, sessionNotFound } from '@/core/errors.js';
import { err, ok } from '@/utils/result.js';
import { domainErrorResponse, errorResponse, jsonResponse, resultResponse } from './utils.js';

describe('HTTP response utilities', () => {
  describe('jsonResponse', () => {
    test('creates 200 JSON response by default', () => {
      const response = jsonResponse({ foo: 'bar' });
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });

    test('respects custom status', () => {
      const response = jsonResponse({ created: true }, { status: 201 });
      expect(response.status).toBe(201);
    });
  });

  describe('errorResponse', () => {
    test('creates error JSON response', async () => {
      const response = errorResponse('Not found', 404);
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toBe('Not found');
    });
  });

  describe('resultResponse', () => {
    test('returns 200 for Ok result', async () => {
      const result = ok({ data: 'value' });
      const response = resultResponse(result);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data).toBe('value');
    });

    test('returns 404 for session not found', async () => {
      const result = err(sessionNotFound('missing'));
      const response = resultResponse(result);
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.code).toBe('SESSION_NOT_FOUND');
      expect(body.error).toContain('missing');
    });

    test('returns 503 for daemon not running', async () => {
      const result = err(daemonNotRunning());
      const response = resultResponse(result);
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.code).toBe('DAEMON_NOT_RUNNING');
    });

    test('returns 403 for path traversal', async () => {
      const result = err(pathTraversal('/etc/passwd'));
      const response = resultResponse(result);
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.code).toBe('PATH_TRAVERSAL');
    });
  });

  describe('domainErrorResponse', () => {
    test('creates response from domain error', async () => {
      const response = domainErrorResponse(sessionNotFound('test'));
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.code).toBe('SESSION_NOT_FOUND');
    });
  });
});
