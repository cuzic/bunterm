/**
 * Shell environment variable injection for automatic shell-integration sourcing.
 *
 * Generates environment variables that cause the appropriate shell-integration
 * script to be sourced automatically when a new session starts, without
 * requiring changes to the user's shell configuration files (e.g. .bashrc).
 *
 * Strategy by shell type:
 * - bash:    Set PROMPT_COMMAND to `source /path/to/bash.sh`
 *            bash.sh's own __BUNTERM_SHELL_INTEGRATION__ guard prevents
 *            double-sourcing on subsequent prompts.
 * - zsh:     Create a temporary ZDOTDIR containing .zshrc and .zshenv that
 *            source bunterm's zsh.sh and then delegate to the user's files.
 *            Mirrors the VS Code approach: no permanent changes to user config.
 * - unknown: No injection.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectShellType } from './shell-detection.js';
import { getBashIntegrationPath, getZshIntegrationPath } from './shell-integration/index.js';

export interface ShellEnvInjection {
  /** Additional environment variables to inject into the spawned shell process. */
  env: Record<string, string>;
  /**
   * Directory to remove when the session ends (used for the ZDOTDIR temp dir
   * created for zsh injection).  Undefined when no cleanup is needed.
   */
  cleanupDir?: string;
}

/**
 * Build shell-specific environment variables for automatic shell-integration
 * injection at session start.
 *
 * @param command - Argv-style command array (e.g. ['bash', '-i']).
 * @param env     - Optional environment variables map (used for multiplexer
 *                  shell detection via $SHELL).
 * @returns       - A ShellEnvInjection whose `env` record should be merged into
 *                  the spawned process environment.  If `cleanupDir` is set,
 *                  the caller must delete it when the session terminates.
 */
export function buildShellEnvInjection(
  command: string[],
  env?: Record<string, string>
): ShellEnvInjection {
  const shellType = detectShellType(command, env);

  switch (shellType) {
    case 'bash': {
      const bashShPath = getBashIntegrationPath();
      return {
        env: {
          PROMPT_COMMAND: `source ${bashShPath}`
        }
      };
    }

    case 'zsh':
      return buildZshInjection(env);
    default:
      return { env: {} };
  }
}

/**
 * Build the ZDOTDIR-based injection for zsh.
 *
 * Creates a temporary directory under /tmp with a unique name, writes minimal
 * .zshrc and .zshenv files that:
 *   1. Source bunterm's zsh.sh integration script.
 *   2. Restore ZDOTDIR to the original value (USER_ZDOTDIR).
 *   3. Delegate to the user's own .zshrc / .zshenv if they exist.
 *
 * The returned `cleanupDir` must be removed by the caller on session exit.
 */
function buildZshInjection(env?: Record<string, string>): ShellEnvInjection {
  // Determine the user's original ZDOTDIR (HOME as fallback, /root as last resort)
  const userZdotdir = env?.ZDOTDIR ?? env?.HOME ?? '/root';

  // Create a unique temporary directory
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tmpDir = `/tmp/bunterm-zsh-${unique}`;
  mkdirSync(tmpDir, { recursive: true });

  const zshShPath = getZshIntegrationPath();

  // .zshrc: source bunterm integration, restore ZDOTDIR, delegate to user .zshrc
  const zshrcContent = [
    '# bunterm shell integration for zsh',
    "# Source bunterm's zsh shell integration",
    `source "${zshShPath}"`,
    '',
    "# Restore original ZDOTDIR and source user's .zshrc",
    'ZDOTDIR="${USER_ZDOTDIR}"',
    'if [[ -f "${ZDOTDIR}/.zshrc" ]]; then',
    '  source "${ZDOTDIR}/.zshrc"',
    'fi'
  ].join('\n');

  // .zshenv: restore ZDOTDIR, delegate to user .zshenv
  const zshenvContent = [
    "# Restore ZDOTDIR for .zshenv and source user's .zshenv",
    'ZDOTDIR="${USER_ZDOTDIR}"',
    'if [[ -f "${ZDOTDIR}/.zshenv" ]]; then',
    '  source "${ZDOTDIR}/.zshenv"',
    'fi'
  ].join('\n');

  writeFileSync(join(tmpDir, '.zshrc'), zshrcContent, 'utf-8');
  writeFileSync(join(tmpDir, '.zshenv'), zshenvContent, 'utf-8');

  return {
    env: {
      ZDOTDIR: tmpDir,
      USER_ZDOTDIR: userZdotdir
    },
    cleanupDir: tmpDir
  };
}
