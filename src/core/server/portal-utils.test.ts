import { describe, expect, test } from 'bun:test';
import {
  escapeHtml,
  generatePwaHead,
  generateSwRegistration,
  portalStyles
} from './portal-utils.js';

describe('portal-utils', () => {
  describe('escapeHtml', () => {
    test('escapes ampersand', () => {
      expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
    });

    test('escapes less than', () => {
      expect(escapeHtml('a < b')).toBe('a &lt; b');
    });

    test('escapes greater than', () => {
      expect(escapeHtml('a > b')).toBe('a &gt; b');
    });

    test('escapes double quotes', () => {
      expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
    });

    test('escapes single quotes', () => {
      expect(escapeHtml("it's")).toBe('it&#039;s');
    });

    test('escapes all special characters together', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      );
    });

    test('returns unmodified string when no escaping needed', () => {
      expect(escapeHtml('hello world')).toBe('hello world');
    });
  });

  describe('generatePwaHead', () => {
    test('generates PWA meta tags with base path', () => {
      const head = generatePwaHead('/bunterm');

      expect(head).toContain('name="theme-color"');
      expect(head).toContain('content="#00d9ff"');
      expect(head).toContain('href="/bunterm/manifest.json"');
      expect(head).toContain('href="/bunterm/icon-192.png"');
      expect(head).toContain('href="/bunterm/icon.svg"');
    });

    test('handles different base paths', () => {
      const head = generatePwaHead('/custom-path');

      expect(head).toContain('href="/custom-path/manifest.json"');
    });
  });

  describe('generateSwRegistration', () => {
    test('generates service worker registration script', () => {
      const script = generateSwRegistration('/bunterm');

      expect(script).toContain('<script>');
      expect(script).toContain('serviceWorker');
      expect(script).toContain("register('/bunterm/sw.js')");
    });
  });

  describe('portalStyles', () => {
    test('contains required CSS rules', () => {
      expect(portalStyles).toContain('box-sizing: border-box');
      expect(portalStyles).toContain('background: #1a1a2e');
      expect(portalStyles).toContain('.session');
      expect(portalStyles).toContain('.name');
      expect(portalStyles).toContain('.no-sessions');
    });
  });
});
