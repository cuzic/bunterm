/**
 * Shell Integration Scripts
 *
 * These scripts emit OSC 633 control sequences for block UI features.
 * They are compatible with VS Code's terminal integration protocol.
 */

// biome-ignore lint: startup-time sync read, script file cached in memory
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Get the bash shell integration script
 */
export function getBashIntegration(): string {
  // biome-ignore lint: sync read at startup
  return readFileSync(join(__dirname, 'bash.sh'), 'utf-8');
}

/**
 * Get the zsh shell integration script
 */
function getZshIntegration(): string {
  // biome-ignore lint: sync read at startup
  return readFileSync(join(__dirname, 'zsh.sh'), 'utf-8');
}

/**
 * Get shell integration script by shell name
 */
function getShellIntegration(shell: 'bash' | 'zsh'): string {
  switch (shell) {
    case 'bash':
      return getBashIntegration();
    case 'zsh':
      return getZshIntegration();
    default:
      throw new Error(`Unsupported shell: ${shell}`);
  }
}

/**
 * Get the absolute path to the bash shell integration script
 */
export function getBashIntegrationPath(): string {
  return join(__dirname, 'bash.sh');
}

/**
 * Get the absolute path to the zsh shell integration script
 */
export function getZshIntegrationPath(): string {
  return join(__dirname, 'zsh.sh');
}

/**
 * Get the absolute path to the shell-integration directory
 * (used when copying scripts to a temp directory for ZDOTDIR)
 */
export function getShellIntegrationDir(): string {
  return __dirname;
}

/**
 * Get auto-detection snippet that sources the appropriate script
 * This can be added to a generic profile
 */
function getAutoDetectSnippet(basePath: string): string {
  return `
# bunterm shell integration auto-detection
if [ -n "$BUNTERM_NATIVE" ]; then
  case "$0" in
    *zsh*)
      source <(curl -s "${basePath}/shell-integration/zsh.sh")
      ;;
    *bash*)
      source <(curl -s "${basePath}/shell-integration/bash.sh")
      ;;
  esac
fi
`.trim();
}
