/**
 * Command Template Utilities
 *
 * Expands command templates with session variables and builds spawn arguments.
 */

/** Template variables available for command expansion */
export interface CommandTemplateVars {
  /** Session name (raw, may contain special chars) */
  name: string;
  /** Sanitized session name (safe for tmux, filenames, etc.) */
  safeName: string;
  /** Working directory path */
  dir: string;
}

/**
 * Sanitize a name for use as tmux session name, filename, etc.
 * Replaces /.:space and control chars with -, collapses consecutive dashes.
 */
export function sanitizeName(name: string): string {
  const sanitized = name
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally strip control chars
    .replace(/[/.::\s\u0000-\u001f]/g, '-')
    .replace(/^-+/, '')
    .replace(/-+/g, '-')
    .replace(/-+$/, '');
  return sanitized || 'session';
}

/**
 * Expand template variables in a command string or array.
 */
export function expandCommand(
  command: string | string[],
  vars: CommandTemplateVars
): string | string[] {
  const replace = (s: string) =>
    s
      .replace(/\{\{name\}\}/g, vars.name)
      .replace(/\{\{safeName\}\}/g, vars.safeName)
      .replace(/\{\{dir\}\}/g, vars.dir);

  if (typeof command === 'string') {
    return replace(command);
  }
  return command.map(replace);
}

/**
 * Build spawn arguments from a command specification.
 * - string: run via shell (sh -c)
 * - string[]: run directly
 * - undefined: default shell
 */
export function buildSpawnArgs(command: string | string[] | undefined): string[] {
  if (typeof command === 'string') {
    return ['sh', '-c', command];
  }
  if (Array.isArray(command)) {
    return command;
  }
  return [process.env['SHELL'] || '/bin/bash', '-i'];
}
