import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { type Config, ConfigSchema } from './types.js';

/** Regex to strip trailing slash */
const TRAILING_SLASH_REGEX = /\/$/;

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
    return ConfigSchema.parse({});
  }

  try {
    const content = readFileSync(path, 'utf-8');
    const parsed = parseYaml(content);
    return ConfigSchema.parse(parsed);
  } catch (error) {
    if (error instanceof Error) {
      const hint = error.message.includes('YAMLParseError')
        ? '\n  Check YAML syntax: indentation and colons.'
        : error.name === 'ZodError'
          ? '\n  Run "bunterm doctor" to validate config.'
          : '';
      throw new Error(`Failed to load config from ${path}:\n  ${error.message}${hint}`);
    }
    throw error;
  }
}

export function normalizeBasePath(basePath: string): string {
  return basePath.replace(TRAILING_SLASH_REGEX, '');
}

export function getFullPath(config: Config, sessionPath: string): string {
  const basePath = normalizeBasePath(config.base_path);
  const path = sessionPath.startsWith('/') ? sessionPath : `/${sessionPath}`;
  return `${basePath}${path}`;
}

export function findSessionDefinition(config: Config, name: string) {
  return config.sessions.find((s) => s.name === name);
}
