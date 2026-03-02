/**
 * Tests for OutputRedactor
 */

import { describe, expect, it } from 'bun:test';
import { BUILTIN_PATTERNS, createRedactor, redactSensitive } from './output-redactor.js';

describe('OutputRedactor', () => {
  describe('BUILTIN_PATTERNS', () => {
    it('should have expected patterns defined', () => {
      const patternNames = BUILTIN_PATTERNS.map((p) => p.name);
      expect(patternNames).toContain('aws_access_key');
      expect(patternNames).toContain('jwt');
      expect(patternNames).toContain('github_token');
      expect(patternNames).toContain('private_key');
      expect(patternNames).toContain('basic_auth_url');
    });
  });

  describe('redact', () => {
    it('should redact AWS access key', () => {
      const redactor = createRedactor();
      const input = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE';
      const result = redactor.redact(input);
      expect(result).toBe('AWS_ACCESS_KEY_ID=[REDACTED]');
    });

    it('should redact AWS secret key', () => {
      const redactor = createRedactor();
      const input = 'aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
      const result = redactor.redact(input);
      expect(result).toBe('aws_secret_access_key=[REDACTED]');
    });

    it('should redact JWT tokens', () => {
      const redactor = createRedactor();
      // Simplified JWT structure
      const input =
        'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const result = redactor.redact(input);
      expect(result).toBe('Authorization: Bearer [REDACTED]');
    });

    it('should redact GitHub tokens', () => {
      const redactor = createRedactor();
      const input = 'GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
      const result = redactor.redact(input);
      expect(result).toBe('GITHUB_TOKEN=[REDACTED]');
    });

    it('should redact Google API keys', () => {
      const redactor = createRedactor();
      const input = 'GOOGLE_API_KEY=AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe';
      const result = redactor.redact(input);
      expect(result).toBe('GOOGLE_API_KEY=[REDACTED]');
    });

    it('should redact Slack tokens', () => {
      const redactor = createRedactor();
      // Use a test token format that matches the pattern
      const input = 'SLACK_TOKEN=xoxb-1234567890-abc123def456';
      const result = redactor.redact(input);
      expect(result).toBe('SLACK_TOKEN=[REDACTED]');
    });

    it('should redact private keys', () => {
      const redactor = createRedactor();
      const input = `-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDN
-----END PRIVATE KEY-----`;
      const result = redactor.redact(input);
      expect(result).toContain('[REDACTED]');
      expect(result).toContain('-----BEGIN PRIVATE KEY-----');
      expect(result).toContain('-----END PRIVATE KEY-----');
    });

    it('should redact basic auth in URLs', () => {
      const redactor = createRedactor();
      const input = 'git clone https://user:secretpassword@github.com/repo.git';
      const result = redactor.redact(input);
      expect(result).toBe('git clone https://user:[REDACTED]@github.com/repo.git');
    });

    it('should redact npm tokens', () => {
      const redactor = createRedactor();
      const input = 'NPM_TOKEN=npm_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
      const result = redactor.redact(input);
      expect(result).toBe('NPM_TOKEN=[REDACTED]');
    });

    it('should redact password assignments', () => {
      const redactor = createRedactor();
      const input = 'password=mysecretpassword123';
      const result = redactor.redact(input);
      expect(result).toBe('password=[REDACTED]');
    });

    it('should handle multiple secrets in same text', () => {
      const redactor = createRedactor();
      const input = `GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE`;
      const result = redactor.redact(input);
      expect(result).not.toContain('ghp_');
      expect(result).not.toContain('AKIA');
    });

    it('should not redact when disabled', () => {
      const redactor = createRedactor({ enabled: false });
      const input = 'GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
      const result = redactor.redact(input);
      expect(result).toBe(input);
    });

    it('should not modify text without secrets', () => {
      const redactor = createRedactor();
      const input = 'Hello, this is a normal log message with no secrets';
      const result = redactor.redact(input);
      expect(result).toBe(input);
    });
  });

  describe('redactWithStats', () => {
    it('should return redaction statistics', () => {
      const redactor = createRedactor();
      const input =
        'GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\nAWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE';
      const { result, stats } = redactor.redactWithStats(input);

      expect(result).not.toContain('ghp_');
      expect(result).not.toContain('AKIA');
      expect(stats.totalRedactions).toBeGreaterThan(0);
      expect(Object.keys(stats.patternMatches).length).toBeGreaterThan(0);
    });

    it('should return zero stats when disabled', () => {
      const redactor = createRedactor({ enabled: false });
      const input = 'GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
      const { result, stats } = redactor.redactWithStats(input);

      expect(result).toBe(input);
      expect(stats.totalRedactions).toBe(0);
    });
  });

  describe('containsSensitive', () => {
    it('should detect sensitive content', () => {
      const redactor = createRedactor();
      expect(redactor.containsSensitive('AKIAIOSFODNN7EXAMPLE')).toBe(true);
      expect(redactor.containsSensitive('normal text')).toBe(false);
    });

    it('should return false when disabled', () => {
      const redactor = createRedactor({ enabled: false });
      expect(redactor.containsSensitive('AKIAIOSFODNN7EXAMPLE')).toBe(false);
    });
  });

  describe('custom patterns', () => {
    it('should support custom patterns', () => {
      const redactor = createRedactor({
        enabled: true,
        customPatterns: [
          {
            name: 'custom_token',
            pattern: 'MY_CUSTOM_[A-Z0-9]{10}',
            replacement: '[CUSTOM_REDACTED]'
          }
        ]
      });

      // Use a unique format that won't match built-in patterns
      const input = 'Found MY_CUSTOM_ABCDE12345 in logs';
      const result = redactor.redact(input);
      expect(result).toBe('Found [CUSTOM_REDACTED] in logs');
    });

    it('should handle invalid custom patterns gracefully', () => {
      // Invalid regex should not crash
      const redactor = createRedactor({
        enabled: true,
        customPatterns: [
          {
            name: 'invalid',
            pattern: '[invalid('
          }
        ]
      });

      const input = 'normal text';
      expect(() => redactor.redact(input)).not.toThrow();
    });
  });

  describe('redactSensitive helper', () => {
    it('should redact using default settings', () => {
      const input = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE';
      const result = redactSensitive(input);
      expect(result).toBe('AWS_ACCESS_KEY_ID=[REDACTED]');
    });
  });
});
