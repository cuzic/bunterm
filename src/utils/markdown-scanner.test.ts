import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { collectMdFiles, collectMdFilesWithResult } from './markdown-scanner.js';

const TEST_DIR = '/tmp/markdown-scanner-test';

describe('markdown-scanner', () => {
  beforeAll(() => {
    // Create test directory structure
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });

    // Create test markdown files
    writeFileSync(join(TEST_DIR, 'README.md'), '# Test');
    writeFileSync(join(TEST_DIR, 'CHANGELOG.md'), '# Changelog');

    // Create subdirectory with files
    mkdirSync(join(TEST_DIR, 'docs'));
    writeFileSync(join(TEST_DIR, 'docs', 'guide.md'), '# Guide');
    writeFileSync(join(TEST_DIR, 'docs', 'api.md'), '# API');

    // Create nested directory
    mkdirSync(join(TEST_DIR, 'docs', 'advanced'));
    writeFileSync(join(TEST_DIR, 'docs', 'advanced', 'tips.md'), '# Tips');

    // Create excluded directory
    mkdirSync(join(TEST_DIR, 'node_modules'));
    writeFileSync(join(TEST_DIR, 'node_modules', 'ignored.md'), '# Should be ignored');

    // Create hidden directory
    mkdirSync(join(TEST_DIR, '.hidden'));
    writeFileSync(join(TEST_DIR, '.hidden', 'secret.md'), '# Should be ignored');
  });

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe('collectMdFiles', () => {
    test('finds markdown files in root directory', () => {
      const files = collectMdFiles(TEST_DIR, TEST_DIR);
      const names = files.map((f) => f.name);

      expect(names).toContain('README.md');
      expect(names).toContain('CHANGELOG.md');
    });

    test('finds markdown files in subdirectories', () => {
      const files = collectMdFiles(TEST_DIR, TEST_DIR);
      const paths = files.map((f) => f.path);

      expect(paths).toContain('docs/guide.md');
      expect(paths).toContain('docs/api.md');
      expect(paths).toContain('docs/advanced/tips.md');
    });

    test('excludes node_modules by default', () => {
      const files = collectMdFiles(TEST_DIR, TEST_DIR);
      const paths = files.map((f) => f.path);

      expect(paths).not.toContain('node_modules/ignored.md');
    });

    test('excludes hidden directories', () => {
      const files = collectMdFiles(TEST_DIR, TEST_DIR);
      const paths = files.map((f) => f.path);

      expect(paths).not.toContain('.hidden/secret.md');
    });

    test('respects maxDepth option', () => {
      const files = collectMdFiles(TEST_DIR, TEST_DIR, { maxDepth: 1 });
      const paths = files.map((f) => f.path);

      expect(paths).toContain('README.md');
      expect(paths).toContain('docs/guide.md');
      expect(paths).not.toContain('docs/advanced/tips.md');
    });

    test('respects custom excludeDirs option', () => {
      const files = collectMdFiles(TEST_DIR, TEST_DIR, { excludeDirs: ['docs'] });
      const paths = files.map((f) => f.path);

      expect(paths).toContain('README.md');
      expect(paths).not.toContain('docs/guide.md');
    });
  });

  describe('collectMdFilesWithResult', () => {
    test('returns result with files', () => {
      const result = collectMdFilesWithResult(TEST_DIR, TEST_DIR);

      expect(result.files.length).toBeGreaterThan(0);
      expect(typeof result.truncated).toBe('boolean');
      expect(typeof result.scannedDirs).toBe('number');
    });

    test('respects maxFiles limit', () => {
      const result = collectMdFilesWithResult(TEST_DIR, TEST_DIR, { maxFiles: 2 });

      expect(result.files.length).toBe(2);
      expect(result.truncated).toBe(true);
    });

    test('sets truncated to false when below limit', () => {
      const result = collectMdFilesWithResult(TEST_DIR, TEST_DIR, { maxFiles: 100 });

      expect(result.truncated).toBe(false);
    });

    test('tracks scanned directories', () => {
      const result = collectMdFilesWithResult(TEST_DIR, TEST_DIR);

      expect(result.scannedDirs).toBeGreaterThan(0);
    });

    test('includes file metadata', () => {
      const result = collectMdFilesWithResult(TEST_DIR, TEST_DIR);
      const readme = result.files.find((f) => f.name === 'README.md');

      expect(readme).toBeDefined();
      expect(readme!.path).toBe('README.md');
      expect(readme!.modifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(readme!.size).toBeGreaterThan(0);
    });
  });
});
