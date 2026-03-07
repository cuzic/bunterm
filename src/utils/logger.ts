/**
 * Simple logger with timestamps and log levels
 */

import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Optional log file path (set via environment variable or setLogFile)
let logFilePath: string | null = process.env['BUNTERM_LOG_FILE'] || null;

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

// Default log level (can be overridden by environment variable)
let currentLevel: LogLevel = (process.env['BUNTERM_LOG_LEVEL'] as LogLevel) || 'info';

function formatTimestamp(): string {
  return new Date().toISOString();
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLevel];
}

function formatMessage(level: LogLevel, component: string, message: string): string {
  const timestamp = formatTimestamp();
  const levelUpper = level.toUpperCase().padEnd(5);
  return `[${timestamp}] ${levelUpper} [${component}] ${message}`;
}

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

export function setLogFile(path: string | null): void {
  logFilePath = path;
  if (path) {
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

export function getLogFile(): string | null {
  return logFilePath;
}

function writeToFile(message: string): void {
  if (logFilePath) {
    try {
      appendFileSync(logFilePath, `${message}\n`);
    } catch {
      // Ignore file write errors
    }
  }
}

export function createLogger(component: string) {
  return {
    debug(message: string, ...args: unknown[]): void {
      if (shouldLog('debug')) {
        const formatted = formatMessage('debug', component, message);
        console.log(formatted, ...args);
        writeToFile(formatted + (args.length > 0 ? ` ${args.map(String).join(' ')}` : ''));
      }
    },

    info(message: string, ...args: unknown[]): void {
      if (shouldLog('info')) {
        const formatted = formatMessage('info', component, message);
        console.log(formatted, ...args);
        writeToFile(formatted + (args.length > 0 ? ` ${args.map(String).join(' ')}` : ''));
      }
    },

    warn(message: string, ...args: unknown[]): void {
      if (shouldLog('warn')) {
        const formatted = formatMessage('warn', component, message);
        console.warn(formatted, ...args);
        writeToFile(formatted + (args.length > 0 ? ` ${args.map(String).join(' ')}` : ''));
      }
    },

    error(message: string, ...args: unknown[]): void {
      if (shouldLog('error')) {
        const formatted = formatMessage('error', component, message);
        console.error(formatted, ...args);
        writeToFile(formatted + (args.length > 0 ? ` ${args.map(String).join(' ')}` : ''));
      }
    }
  };
}

export type Logger = ReturnType<typeof createLogger>;
