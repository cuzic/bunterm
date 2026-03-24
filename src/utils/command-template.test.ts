import { describe, expect, test } from 'bun:test';
import { buildSpawnArgs, expandCommand, sanitizeName } from './command-template.js';

describe('sanitizeName', () => {
  test('replaces dots and colons with dashes', () => {
    expect(sanitizeName('my.project:v2')).toBe('my-project-v2');
  });

  test('replaces spaces with dashes', () => {
    expect(sanitizeName('hello world')).toBe('hello-world');
  });

  test('strips leading/trailing dashes and collapses consecutive dashes', () => {
    expect(sanitizeName('---test---')).toBe('test');
  });

  test("returns 'session' for empty string", () => {
    expect(sanitizeName('')).toBe('session');
  });

  test('keeps normal names unchanged', () => {
    expect(sanitizeName('normal')).toBe('normal');
  });

  test('replaces slashes with dashes', () => {
    expect(sanitizeName('path/to/thing')).toBe('path-to-thing');
  });

  test('replaces control characters', () => {
    expect(sanitizeName('abc\x01def')).toBe('abc-def');
  });
});

describe('expandCommand', () => {
  const vars = {
    name: 'my.app',
    safeName: 'my-app',
    dir: '/home/user'
  };

  test('expands variables in a string', () => {
    expect(expandCommand('tmux new -s {{safeName}}', vars)).toBe('tmux new -s my-app');
  });

  test('expands variables in an array', () => {
    expect(expandCommand(['tmux', 'new', '-s', '{{safeName}}'], vars)).toEqual([
      'tmux',
      'new',
      '-s',
      'my-app'
    ]);
  });

  test('expands multiple different variables', () => {
    expect(expandCommand('{{name}} in {{dir}}', vars)).toBe('my.app in /home/user');
  });

  test('expands repeated variables', () => {
    expect(expandCommand('{{name}}-{{name}}', vars)).toBe('my.app-my.app');
  });

  test('returns string unchanged when no variables present', () => {
    expect(expandCommand('plain command', vars)).toBe('plain command');
  });
});

describe('buildSpawnArgs', () => {
  test('wraps string command in sh -c', () => {
    expect(buildSpawnArgs('tmux new')).toEqual(['sh', '-c', 'tmux new']);
  });

  test('passes array command through directly', () => {
    expect(buildSpawnArgs(['tmux', 'new'])).toEqual(['tmux', 'new']);
  });

  test('returns default shell for undefined', () => {
    const result = buildSpawnArgs(undefined);
    // Should use $SHELL or fallback to /bin/bash
    expect(result.length).toBe(2);
    expect(result[0]).toBe(process.env['SHELL'] || '/bin/bash');
    expect(result[1]).toBe('-i');
  });
});
