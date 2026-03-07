import { describe, expect, it } from 'bun:test';
import type { StaticOffloadConfig } from '@/core/config/types.js';
import {
  createOffloadResponse,
  generateCaddyOffloadSnippet,
  generateNginxOffloadSnippet,
  getMimeType,
  isOffloadEnabled
} from './static-offload.js';

describe('static-offload', () => {
  describe('getMimeType', () => {
    it('should return correct MIME types for common extensions', () => {
      expect(getMimeType('/path/to/file.html')).toBe('text/html');
      expect(getMimeType('/path/to/file.js')).toBe('application/javascript');
      expect(getMimeType('/path/to/file.css')).toBe('text/css');
      expect(getMimeType('/path/to/file.json')).toBe('application/json');
      expect(getMimeType('/path/to/file.png')).toBe('image/png');
      expect(getMimeType('/path/to/file.jpg')).toBe('image/jpeg');
      expect(getMimeType('/path/to/file.svg')).toBe('image/svg+xml');
      expect(getMimeType('/path/to/file.pdf')).toBe('application/pdf');
    });

    it('should return application/octet-stream for unknown extensions', () => {
      expect(getMimeType('/path/to/file.xyz')).toBe('application/octet-stream');
      expect(getMimeType('/path/to/file')).toBe('application/octet-stream');
    });

    it('should handle uppercase extensions', () => {
      expect(getMimeType('/path/to/file.HTML')).toBe('text/html');
      expect(getMimeType('/path/to/file.PNG')).toBe('image/png');
    });
  });

  describe('isOffloadEnabled', () => {
    it('should return true when enabled', () => {
      const config: StaticOffloadConfig = {
        enabled: true,
        internal_path_prefix: '/_internal'
      };
      expect(isOffloadEnabled(config)).toBe(true);
    });

    it('should return false when disabled', () => {
      const config: StaticOffloadConfig = {
        enabled: false,
        internal_path_prefix: '/_internal'
      };
      expect(isOffloadEnabled(config)).toBe(false);
    });

    it('should return false for undefined config', () => {
      expect(isOffloadEnabled(undefined)).toBe(false);
    });
  });

  describe('createOffloadResponse', () => {
    const config: StaticOffloadConfig = {
      enabled: true,
      internal_path_prefix: '/_internal_files'
    };

    it('should create response with X-Accel-Redirect header', () => {
      const response = createOffloadResponse(config, '/home/user/file.txt');

      expect(response.status).toBe(200);
      expect(response.headers.get('X-Accel-Redirect')).toBe('/_internal_files/home/user/file.txt');
      expect(response.headers.get('Content-Type')).toBe('text/plain');
    });

    it('should set Content-Disposition for downloads', () => {
      const response = createOffloadResponse(config, '/home/user/document.pdf', {
        download: true
      });

      const disposition = response.headers.get('Content-Disposition');
      expect(disposition).toContain('attachment');
      expect(disposition).toContain('document.pdf');
    });

    it('should use custom filename for downloads', () => {
      const response = createOffloadResponse(config, '/home/user/data.csv', {
        download: true,
        filename: 'export-2024-01-01.csv'
      });

      const disposition = response.headers.get('Content-Disposition');
      expect(disposition).toContain('export-2024-01-01.csv');
    });

    it('should use custom content type', () => {
      const response = createOffloadResponse(config, '/home/user/file.xyz', {
        contentType: 'application/custom'
      });

      expect(response.headers.get('Content-Type')).toBe('application/custom');
    });

    it('should set X-Accel-Buffering to no', () => {
      const response = createOffloadResponse(config, '/home/user/large-file.zip');

      expect(response.headers.get('X-Accel-Buffering')).toBe('no');
    });
  });

  describe('generateCaddyOffloadSnippet', () => {
    it('should generate valid Caddy configuration', () => {
      const snippet = generateCaddyOffloadSnippet('/_internal_files');

      expect(snippet).toContain('handle_path /_internal_files/*');
      expect(snippet).toContain('root * /');
      expect(snippet).toContain('file_server');
      expect(snippet).toContain('X-Accel-Redirect');
    });
  });

  describe('generateNginxOffloadSnippet', () => {
    it('should generate valid Nginx configuration', () => {
      const snippet = generateNginxOffloadSnippet('/_internal_files');

      expect(snippet).toContain('location /_internal_files/');
      expect(snippet).toContain('internal');
      expect(snippet).toContain('alias /');
    });
  });
});
