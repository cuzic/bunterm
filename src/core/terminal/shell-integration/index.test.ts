import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import {
  getBashIntegration,
  getBashIntegrationPath,
  getShellIntegrationDir,
  getZshIntegrationPath
} from './index.js';

describe('getBashIntegrationPath()', () => {
  it('returns a string', () => {
    const result = getBashIntegrationPath();
    expect(typeof result).toBe('string');
  });

  it('points to an existing file', () => {
    const path = getBashIntegrationPath();
    expect(existsSync(path)).toBe(true);
  });

  it('ends with bash.sh', () => {
    const path = getBashIntegrationPath();
    expect(path.endsWith('bash.sh')).toBe(true);
  });
});

describe('getZshIntegrationPath()', () => {
  it('returns a string', () => {
    const result = getZshIntegrationPath();
    expect(typeof result).toBe('string');
  });

  it('points to an existing file', () => {
    const path = getZshIntegrationPath();
    expect(existsSync(path)).toBe(true);
  });

  it('ends with zsh.sh', () => {
    const path = getZshIntegrationPath();
    expect(path.endsWith('zsh.sh')).toBe(true);
  });
});

describe('getShellIntegrationDir()', () => {
  it('returns a path that exists as a directory', () => {
    const dir = getShellIntegrationDir();
    expect(existsSync(dir)).toBe(true);
    expect(statSync(dir).isDirectory()).toBe(true);
  });
});

describe('consistency between content and path helpers', () => {
  it('getBashIntegration() content matches the file at getBashIntegrationPath()', () => {
    const fromContent = getBashIntegration();
    const fromPath = readFileSync(getBashIntegrationPath(), 'utf-8');
    expect(fromContent).toBe(fromPath);
  });
});
