/**
 * Shell type detection for bunterm sessions.
 *
 * Determines the shell type from a command array and optional environment
 * variables, enabling appropriate shell-integration injection strategy.
 *
 * Detection priority:
 * 1. Basename of the first element in command (direct shell execution)
 * 2. $SHELL env var when command is a known terminal multiplexer
 * 3. 'unknown' fallback
 */

import { basename } from 'node:path';

export type ShellType = 'bash' | 'zsh' | 'unknown';

/**
 * Terminal multiplexers that do not directly name the shell; fall back to
 * the $SHELL environment variable for detection.
 */
const MULTIPLEXERS = new Set(['tmux', 'zellij', 'screen']);

/**
 * Resolve a shell name (e.g. 'bash', '/usr/bin/zsh') to a ShellType.
 * Only the basename is used so that path components are ignored.
 */
function resolveShellName(name: string): ShellType {
  const base = basename(name);
  if (base === 'bash') return 'bash';
  if (base === 'zsh') return 'zsh';
  return 'unknown';
}

/**
 * Detect the shell type from a command array and optional environment.
 *
 * @param command - Argv-style command array (e.g. ['bash', '-i']).
 * @param env     - Optional environment variables map.
 * @returns       - 'bash' | 'zsh' | 'unknown'
 */
export function detectShellType(command: string[], env?: Record<string, string>): ShellType {
  if (command.length === 0) return 'unknown';

  const executable = command[0];
  const execBase = basename(executable);

  // Direct shell: the executable itself names the shell.
  if (execBase === 'bash' || execBase === 'zsh') {
    return resolveShellName(executable);
  }

  // Multiplexer: consult $SHELL env var.
  if (MULTIPLEXERS.has(execBase)) {
    const shellEnv = env?.SHELL;
    if (shellEnv) {
      return resolveShellName(shellEnv);
    }
    return 'unknown';
  }

  return 'unknown';
}
