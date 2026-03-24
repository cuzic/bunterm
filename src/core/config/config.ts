import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { type Config, ConfigSchema } from './types.js';

function getConfigPaths(): string[] {
  return [
    join(process.cwd(), 'bunterm.yaml'),
    join(process.cwd(), '.bunterm.yaml'),
    join(homedir(), '.config', 'bunterm', 'config.yaml')
  ];
}

export function findConfigPath(): string | null {
  for (const path of getConfigPaths()) {
    if (existsSync(path)) {
      return path;
    }
  }
  return null;
}

export function loadConfig(configPath?: string): Config {
  const path = configPath ?? findConfigPath();

  if (!path) {
    // Return default config using zod defaults
    const result = ConfigSchema.safeParse({});
    if (!result.success) {
      throw new Error('Failed to create default config');
    }
    return result.data;
  }

  let content: string;
  try {
    // biome-ignore lint: sync read required at startup
    content = readFileSync(path, 'utf-8');
  } catch (error) {
    throw new Error(
      `Failed to read config from ${path}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to load config from ${path}:\n  ${message}\n  Check YAML syntax: indentation and colons.`
    );
  }

  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue?.path.join('.') || 'unknown';
    throw new Error(
      `Failed to load config from ${path}:\n  Invalid value for '${field}': ${issue?.message}\n  Run "bunterm doctor" to validate config.`
    );
  }

  return result.data;
}

export function getFullPath(config: Config, sessionPath: string): string {
  const path = sessionPath.startsWith('/') ? sessionPath : `/${sessionPath}`;
  return `${config.base_path}${path}`;
}

export function findSessionDefinition(config: Config, name: string) {
  return config.sessions.find((s) => s.name === name);
}
