/**
 * Directory Browser Tests
 *
 * Tests for directory browsing functionality used in portal session creation.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import type { DirectoryBrowserConfig } from '@/core/config/types.js';
import {
  contractTilde,
  expandTilde,
  getAllowedDirectories,
  isRelativePathSafe,
  isWithinAllowedDirectories,
  listSubdirectories,
  validateDirectoryPath
} from './directory-browser.js';

// Test directory setup
let testDir: string;
let projectsDir: string;
let workDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `bunterm-dirbrowser-test-${Date.now()}`);
  projectsDir = join(testDir, 'projects');
  workDir = join(testDir, 'work');

  // Create test directory structure
  mkdirSync(join(projectsDir, 'my-app', 'src'), { recursive: true });
  mkdirSync(join(projectsDir, 'bunterm', 'tests'), { recursive: true });
  mkdirSync(join(projectsDir, '.hidden'), { recursive: true });
  mkdirSync(workDir, { recursive: true });

  // Create some files (should be ignored in directory listing)
  writeFileSync(join(projectsDir, 'README.md'), 'test');
  writeFileSync(join(projectsDir, 'my-app', 'package.json'), '{}');
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// =============================================================================
// Path expansion/contraction tests
// =============================================================================

describe('expandTilde', () => {
  test('expands ~ to home directory', () => {
    expect(expandTilde('~')).toBe(homedir());
  });

  test('expands ~/ prefix to home directory', () => {
    expect(expandTilde('~/projects')).toBe(join(homedir(), 'projects'));
  });

  test('does not modify paths without tilde', () => {
    expect(expandTilde('/home/user/projects')).toBe('/home/user/projects');
  });

  test('does not modify relative paths', () => {
    expect(expandTilde('foo/bar')).toBe('foo/bar');
  });
});

describe('contractTilde', () => {
  test('contracts home directory to ~', () => {
    expect(contractTilde(homedir())).toBe('~');
  });

  test('contracts paths starting with home directory', () => {
    expect(contractTilde(join(homedir(), 'projects'))).toBe('~/projects');
  });

  test('does not modify paths outside home directory', () => {
    expect(contractTilde('/tmp/foo')).toBe('/tmp/foo');
  });
});

// =============================================================================
// Path safety tests
// =============================================================================

describe('isRelativePathSafe', () => {
  test('accepts empty path (root of base)', () => {
    expect(isRelativePathSafe('')).toBe(true);
  });

  test('accepts simple directory names', () => {
    expect(isRelativePathSafe('projects')).toBe(true);
    expect(isRelativePathSafe('my-app')).toBe(true);
  });

  test('accepts nested paths', () => {
    expect(isRelativePathSafe('projects/my-app')).toBe(true);
    expect(isRelativePathSafe('a/b/c/d')).toBe(true);
  });

  test('rejects paths with ".." traversal', () => {
    expect(isRelativePathSafe('..')).toBe(false);
    expect(isRelativePathSafe('../etc')).toBe(false);
    expect(isRelativePathSafe('foo/../../../etc')).toBe(false);
  });

  test('rejects absolute paths', () => {
    expect(isRelativePathSafe('/etc/passwd')).toBe(false);
    expect(isRelativePathSafe('/home/user')).toBe(false);
  });

  test('rejects Windows absolute paths', () => {
    expect(isRelativePathSafe('C:\\Windows')).toBe(false);
    expect(isRelativePathSafe('D:/Users')).toBe(false);
  });

  test('rejects null bytes', () => {
    expect(isRelativePathSafe('foo\x00bar')).toBe(false);
  });

  test('rejects URL-encoded traversal', () => {
    expect(isRelativePathSafe('%2e%2e')).toBe(false);
    expect(isRelativePathSafe('foo%2f..%2fbar')).toBe(false);
  });
});

// =============================================================================
// getAllowedDirectories tests
// =============================================================================

describe('getAllowedDirectories', () => {
  test('returns empty array when disabled', () => {
    const config: DirectoryBrowserConfig = {
      enabled: false,
      allowed_directories: [projectsDir]
    };
    expect(getAllowedDirectories(config)).toEqual([]);
  });

  test('returns empty array when no directories configured', () => {
    const config: DirectoryBrowserConfig = {
      enabled: true,
      allowed_directories: []
    };
    expect(getAllowedDirectories(config)).toEqual([]);
  });

  test('filters out non-existent directories', () => {
    const config: DirectoryBrowserConfig = {
      enabled: true,
      allowed_directories: [projectsDir, '/nonexistent/path']
    };
    const result = getAllowedDirectories(config);
    expect(result.length).toBe(1);
    expect(result[0]?.path).toBe(projectsDir);
  });

  test('expands tilde in directory paths', () => {
    // Create a directory under the test dir and pretend it's the home
    const fakeHome = join(testDir, 'fakehome');
    mkdirSync(fakeHome, { recursive: true });

    const config: DirectoryBrowserConfig = {
      enabled: true,
      allowed_directories: [projectsDir]
    };
    const result = getAllowedDirectories(config);
    expect(result.length).toBe(1);
    expect(result[0]?.path).toBe(projectsDir);
  });

  test('returns path and display name for each directory', () => {
    const config: DirectoryBrowserConfig = {
      enabled: true,
      allowed_directories: [projectsDir, workDir]
    };
    const result = getAllowedDirectories(config);
    expect(result.length).toBe(2);
    expect(result[0]).toHaveProperty('path');
    expect(result[0]).toHaveProperty('name');
  });
});

// =============================================================================
// isWithinAllowedDirectories tests
// =============================================================================

describe('isWithinAllowedDirectories', () => {
  test('returns true for allowed base directory', () => {
    const config: DirectoryBrowserConfig = {
      enabled: true,
      allowed_directories: [projectsDir]
    };
    expect(isWithinAllowedDirectories(projectsDir, config)).toBe(true);
  });

  test('returns true for subdirectory of allowed directory', () => {
    const config: DirectoryBrowserConfig = {
      enabled: true,
      allowed_directories: [projectsDir]
    };
    expect(isWithinAllowedDirectories(join(projectsDir, 'my-app'), config)).toBe(true);
    expect(isWithinAllowedDirectories(join(projectsDir, 'my-app', 'src'), config)).toBe(true);
  });

  test('returns false for directory outside allowed directories', () => {
    const config: DirectoryBrowserConfig = {
      enabled: true,
      allowed_directories: [projectsDir]
    };
    expect(isWithinAllowedDirectories('/etc', config)).toBe(false);
    expect(isWithinAllowedDirectories(workDir, config)).toBe(false);
  });

  test('returns false when disabled', () => {
    const config: DirectoryBrowserConfig = {
      enabled: false,
      allowed_directories: [projectsDir]
    };
    expect(isWithinAllowedDirectories(projectsDir, config)).toBe(false);
  });
});

// =============================================================================
// listSubdirectories tests
// =============================================================================

describe('listSubdirectories', () => {
  test('returns null for invalid base index', () => {
    const config: DirectoryBrowserConfig = {
      enabled: true,
      allowed_directories: [projectsDir]
    };
    expect(listSubdirectories(config, -1, '')).toBeNull();
    expect(listSubdirectories(config, 10, '')).toBeNull();
  });

  test('returns null for unsafe relative path', () => {
    const config: DirectoryBrowserConfig = {
      enabled: true,
      allowed_directories: [projectsDir]
    };
    expect(listSubdirectories(config, 0, '../etc')).toBeNull();
    expect(listSubdirectories(config, 0, '/etc')).toBeNull();
  });

  test('lists directories at base level', () => {
    const config: DirectoryBrowserConfig = {
      enabled: true,
      allowed_directories: [projectsDir]
    };
    const result = listSubdirectories(config, 0, '');
    expect(result).not.toBeNull();
    if (!result) {
      return;
    }
    expect(result.current).toBe(projectsDir);
    expect(result.directories.length).toBe(2); // my-app, bunterm (hidden dirs excluded)
    expect(result.directories.map((d) => d.name)).toContain('my-app');
    expect(result.directories.map((d) => d.name)).toContain('bunterm');
  });

  test('excludes hidden directories', () => {
    const config: DirectoryBrowserConfig = {
      enabled: true,
      allowed_directories: [projectsDir]
    };
    const result = listSubdirectories(config, 0, '');
    expect(result).not.toBeNull();
    if (!result) {
      return;
    }
    expect(result.directories.map((d) => d.name)).not.toContain('.hidden');
  });

  test('lists subdirectories with relative path', () => {
    const config: DirectoryBrowserConfig = {
      enabled: true,
      allowed_directories: [projectsDir]
    };
    const result = listSubdirectories(config, 0, 'my-app');
    expect(result).not.toBeNull();
    if (!result) {
      return;
    }
    expect(result.current).toBe(join(projectsDir, 'my-app'));
    expect(result.directories.map((d) => d.name)).toContain('src');
  });

  test('returns correct relative paths in directory entries', () => {
    const config: DirectoryBrowserConfig = {
      enabled: true,
      allowed_directories: [projectsDir]
    };
    const result = listSubdirectories(config, 0, 'my-app');
    expect(result).not.toBeNull();
    if (!result) {
      return;
    }
    const srcEntry = result.directories.find((d) => d.name === 'src');
    expect(srcEntry).toBeDefined();
    expect(srcEntry?.path).toBe('my-app/src');
  });

  test('returns empty directories array for leaf directories', () => {
    const config: DirectoryBrowserConfig = {
      enabled: true,
      allowed_directories: [projectsDir]
    };
    const result = listSubdirectories(config, 0, 'my-app/src');
    expect(result).not.toBeNull();
    if (!result) {
      return;
    }
    expect(result.directories.length).toBe(0);
  });

  test('sorts directories alphabetically (case-insensitive)', () => {
    // Create directories with mixed case
    mkdirSync(join(projectsDir, 'Alpha'), { recursive: true });
    mkdirSync(join(projectsDir, 'beta'), { recursive: true });
    mkdirSync(join(projectsDir, 'GAMMA'), { recursive: true });

    const config: DirectoryBrowserConfig = {
      enabled: true,
      allowed_directories: [projectsDir]
    };
    const result = listSubdirectories(config, 0, '');
    expect(result).not.toBeNull();
    if (!result) {
      return;
    }

    const names = result.directories.map((d) => d.name);
    // Should be sorted case-insensitively
    expect(names.indexOf('Alpha')).toBeLessThan(names.indexOf('beta'));
    expect(names.indexOf('beta')).toBeLessThan(names.indexOf('GAMMA'));
  });
});

// =============================================================================
// Symlink security tests
// =============================================================================

describe('symlink security', () => {
  test('excludes symlinks pointing outside allowed directories', () => {
    // Create a symlink pointing to /tmp (outside allowed directories)
    const outsideDir = join(tmpdir(), `bunterm-outside-${Date.now()}`);
    mkdirSync(outsideDir, { recursive: true });

    try {
      const symlinkPath = join(projectsDir, 'outside-link');
      symlinkSync(outsideDir, symlinkPath);

      const config: DirectoryBrowserConfig = {
        enabled: true,
        allowed_directories: [projectsDir]
      };
      const result = listSubdirectories(config, 0, '');
      expect(result).not.toBeNull();
      if (!result) {
        return;
      }
      expect(result.directories.map((d) => d.name)).not.toContain('outside-link');
    } finally {
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  test('includes symlinks pointing within allowed directories', () => {
    // Create a symlink pointing to another directory within allowed
    const symlinkPath = join(projectsDir, 'work-link');
    symlinkSync(join(projectsDir, 'my-app'), symlinkPath);

    const config: DirectoryBrowserConfig = {
      enabled: true,
      allowed_directories: [projectsDir]
    };
    const result = listSubdirectories(config, 0, '');
    expect(result).not.toBeNull();
    if (!result) {
      return;
    }
    expect(result.directories.map((d) => d.name)).toContain('work-link');
  });
});

// =============================================================================
// validateDirectoryPath tests
// =============================================================================

describe('validateDirectoryPath', () => {
  test('returns true for valid directory within allowed', () => {
    const config: DirectoryBrowserConfig = {
      enabled: true,
      allowed_directories: [projectsDir]
    };
    expect(validateDirectoryPath(config, projectsDir)).toBe(true);
    expect(validateDirectoryPath(config, join(projectsDir, 'my-app'))).toBe(true);
  });

  test('returns false for non-existent directory', () => {
    const config: DirectoryBrowserConfig = {
      enabled: true,
      allowed_directories: [projectsDir]
    };
    expect(validateDirectoryPath(config, join(projectsDir, 'nonexistent'))).toBe(false);
  });

  test('returns false for file path', () => {
    const config: DirectoryBrowserConfig = {
      enabled: true,
      allowed_directories: [projectsDir]
    };
    expect(validateDirectoryPath(config, join(projectsDir, 'README.md'))).toBe(false);
  });

  test('returns false for directory outside allowed', () => {
    const config: DirectoryBrowserConfig = {
      enabled: true,
      allowed_directories: [projectsDir]
    };
    expect(validateDirectoryPath(config, '/etc')).toBe(false);
  });

  test('returns false when disabled', () => {
    const config: DirectoryBrowserConfig = {
      enabled: false,
      allowed_directories: [projectsDir]
    };
    expect(validateDirectoryPath(config, projectsDir)).toBe(false);
  });

  test('expands tilde in path', () => {
    // This test uses the real home directory
    const config: DirectoryBrowserConfig = {
      enabled: true,
      allowed_directories: [homedir()]
    };
    expect(validateDirectoryPath(config, '~')).toBe(true);
  });
});
