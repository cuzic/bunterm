import { describe, expect, test } from 'bun:test';
import {
  generateManifest,
  getIconPng,
  getIconSvg,
  getManifestJson,
  getServiceWorker,
  iconSvg,
  serviceWorkerScript
} from './pwa.js';

describe('pwa', () => {
  describe('generateManifest', () => {
    test('generates valid manifest object', () => {
      const manifest = generateManifest('/bunterm');

      expect(manifest).toHaveProperty('name', 'bunterm');
      expect(manifest).toHaveProperty('short_name', 'bunterm');
      expect(manifest).toHaveProperty('display', 'fullscreen');
      expect(manifest).toHaveProperty('start_url', '/bunterm/');
    });

    test('includes icons with correct paths', () => {
      const manifest = generateManifest('/bunterm') as {
        icons: Array<{ src: string; sizes: string; type: string }>;
      };

      expect(manifest.icons).toBeArray();
      expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

      const svgIcon = manifest.icons.find((i) => i.type === 'image/svg+xml');
      expect(svgIcon).toBeDefined();
      expect(svgIcon?.src).toBe('/bunterm/icon.svg');

      const png192 = manifest.icons.find((i) => i.sizes === '192x192');
      expect(png192).toBeDefined();
      expect(png192?.src).toBe('/bunterm/icon-192.png');

      const png512 = manifest.icons.find((i) => i.sizes === '512x512');
      expect(png512).toBeDefined();
      expect(png512?.src).toBe('/bunterm/icon-512.png');
    });

    test('uses correct theme colors', () => {
      const manifest = generateManifest('/bunterm') as {
        background_color: string;
        theme_color: string;
      };

      expect(manifest.background_color).toBe('#1a1a2e');
      expect(manifest.theme_color).toBe('#00d9ff');
    });

    test('handles different base paths', () => {
      const manifest1 = generateManifest('/app') as { start_url: string };
      expect(manifest1.start_url).toBe('/app/');

      const manifest2 = generateManifest('/custom/path') as { start_url: string };
      expect(manifest2.start_url).toBe('/custom/path/');
    });
  });

  describe('getManifestJson', () => {
    test('returns valid JSON string', () => {
      const json = getManifestJson('/bunterm');

      expect(() => JSON.parse(json)).not.toThrow();
    });

    test('JSON contains required fields', () => {
      const json = getManifestJson('/bunterm');
      const manifest = JSON.parse(json);

      expect(manifest.name).toBe('bunterm');
      expect(manifest.display).toBe('fullscreen');
    });
  });

  describe('serviceWorkerScript', () => {
    test('contains install event listener', () => {
      expect(serviceWorkerScript).toContain("addEventListener('install'");
    });

    test('contains activate event listener', () => {
      expect(serviceWorkerScript).toContain("addEventListener('activate'");
    });

    test('contains fetch event listener', () => {
      expect(serviceWorkerScript).toContain("addEventListener('fetch'");
    });

    test('uses skipWaiting for immediate activation', () => {
      expect(serviceWorkerScript).toContain('skipWaiting()');
    });
  });

  describe('getServiceWorker', () => {
    test('returns service worker script', () => {
      const sw = getServiceWorker();

      expect(sw).toBe(serviceWorkerScript);
      expect(sw).toContain('self.addEventListener');
    });
  });

  describe('iconSvg', () => {
    test('is valid SVG', () => {
      expect(iconSvg).toContain('<svg');
      expect(iconSvg).toContain('</svg>');
      expect(iconSvg).toContain('xmlns="http://www.w3.org/2000/svg"');
    });

    test('contains terminal prompt symbol', () => {
      // SVG uses HTML entity for > character
      expect(iconSvg).toContain('&gt;_');
    });

    test('uses correct colors', () => {
      expect(iconSvg).toContain('#1a1a2e'); // background
      expect(iconSvg).toContain('#00d9ff'); // text color
    });
  });

  describe('getIconSvg', () => {
    test('returns SVG string', () => {
      const svg = getIconSvg();

      expect(svg).toBe(iconSvg);
      expect(svg).toContain('<svg');
    });
  });

  describe('getIconPng', () => {
    test('returns valid PNG buffer for 192x192', () => {
      const png = getIconPng(192);

      expect(png).toBeInstanceOf(Buffer);
      // PNG magic bytes
      expect(png[0]).toBe(0x89);
      expect(png[1]).toBe(0x50); // P
      expect(png[2]).toBe(0x4e); // N
      expect(png[3]).toBe(0x47); // G
    });

    test('returns valid PNG buffer for 512x512', () => {
      const png = getIconPng(512);

      expect(png).toBeInstanceOf(Buffer);
      // PNG magic bytes
      expect(png[0]).toBe(0x89);
      expect(png[1]).toBe(0x50); // P
      expect(png[2]).toBe(0x4e); // N
      expect(png[3]).toBe(0x47); // G
    });

    test('192 and 512 icons are different sizes', () => {
      const png192 = getIconPng(192);
      const png512 = getIconPng(512);

      // 512x512 should be larger than 192x192
      expect(png512.length).toBeGreaterThan(png192.length);
    });
  });
});
