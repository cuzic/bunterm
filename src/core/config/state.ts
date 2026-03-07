import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { lockSync, unlockSync } from 'proper-lockfile';
import type { StateStore } from './state-store.js';
import type {
  DaemonState,
  PushSubscriptionState,
  SessionState,
  ShareState,
  State
} from './types.js';

/**
 * Get config directory path.
 * Can be overridden via BUNTERM_CONFIG_DIR environment variable.
 */
function getConfigDirPath(): string {
  return process.env['BUNTERM_CONFIG_DIR'] ?? join(homedir(), '.config', 'bunterm');
}

/**
 * Get state directory path.
 * Can be overridden via BUNTERM_STATE_DIR environment variable for testing.
 */
function getStateDirPath(): string {
  return process.env['BUNTERM_STATE_DIR'] ?? join(homedir(), '.local', 'state', 'bunterm');
}

function getStateFilePath(): string {
  return join(getStateDirPath(), 'state.json');
}

function getSocketFilePath(): string {
  return join(getStateDirPath(), 'bunterm.sock');
}

export function getConfigDir(): string {
  return getConfigDirPath();
}

export function getStateDir(): string {
  return getStateDirPath();
}

export function getSocketPath(): string {
  return getSocketFilePath();
}

function ensureStateDir(): void {
  const stateDir = getStateDirPath();
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }
}

function ensureStateFile(): void {
  ensureStateDir();
  const stateFile = getStateFilePath();
  if (!existsSync(stateFile)) {
    writeFileSync(stateFile, JSON.stringify(getDefaultState(), null, 2));
  }
}

function getDefaultState(): State {
  return {
    daemon: null,
    sessions: [],
    shares: [],
    pushSubscriptions: []
  };
}

export function loadState(): State {
  const stateFile = getStateFilePath();
  if (!existsSync(stateFile)) {
    return getDefaultState();
  }

  try {
    const content = readFileSync(stateFile, 'utf-8');
    const parsed = JSON.parse(content) as Partial<State>;
    // Merge with defaults to handle missing fields from old state files
    const defaultState = getDefaultState();
    return {
      daemon: parsed.daemon ?? defaultState.daemon,
      sessions: parsed.sessions ?? defaultState.sessions,
      shares: parsed.shares ?? defaultState.shares,
      pushSubscriptions: parsed.pushSubscriptions ?? defaultState.pushSubscriptions
    };
  } catch {
    return getDefaultState();
  }
}

export function saveState(state: State): void {
  ensureStateDir();
  const stateFile = getStateFilePath();
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

/**
 * Execute a function with exclusive file lock on state.json
 */
export function withStateLock<T>(fn: () => T): T {
  ensureStateFile();
  const stateFile = getStateFilePath();
  lockSync(stateFile);
  try {
    return fn();
  } finally {
    unlockSync(stateFile);
  }
}

// === Daemon State ===

export function setDaemonState(daemon: DaemonState): void {
  withStateLock(() => {
    const state = loadState();
    state.daemon = daemon;
    saveState(state);
  });
}

export function clearDaemonState(): void {
  withStateLock(() => {
    const state = loadState();
    state.daemon = null;
    saveState(state);
  });
}

export function getDaemonState(): DaemonState | null {
  return loadState().daemon;
}

// === Session State ===

export function addSession(session: SessionState): void {
  withStateLock(() => {
    const state = loadState();
    // Remove existing session with same name
    state.sessions = state.sessions.filter((s) => s.name !== session.name);
    state.sessions.push(session);
    saveState(state);
  });
}

export function removeSession(name: string): void {
  withStateLock(() => {
    const state = loadState();
    state.sessions = state.sessions.filter((s) => s.name !== name);
    saveState(state);
  });
}

export function getSession(name: string): SessionState | undefined {
  return loadState().sessions.find((s) => s.name === name);
}

export function getSessionByDir(dir: string): SessionState | undefined {
  return loadState().sessions.find((s) => s.dir === dir);
}

export function getAllSessions(): SessionState[] {
  return loadState().sessions;
}

export function getNextPath(basePath: string, name: string): string {
  return `${basePath}/${name}`.replace(/\/+/g, '/');
}

// === Share State ===

export function addShare(share: ShareState): void {
  withStateLock(() => {
    const state = loadState();
    // Remove existing share with same token
    state.shares = state.shares.filter((s) => s.token !== share.token);
    state.shares.push(share);
    saveState(state);
  });
}

export function removeShare(token: string): void {
  withStateLock(() => {
    const state = loadState();
    state.shares = state.shares.filter((s) => s.token !== token);
    saveState(state);
  });
}

export function getShare(token: string): ShareState | undefined {
  return loadState().shares.find((s) => s.token === token);
}

export function getAllShares(): ShareState[] {
  return loadState().shares;
}

// === Push Subscription State ===

export function addPushSubscription(subscription: PushSubscriptionState): void {
  withStateLock(() => {
    const state = loadState();
    // Remove existing subscription with same endpoint
    state.pushSubscriptions = state.pushSubscriptions.filter(
      (s) => s.endpoint !== subscription.endpoint
    );
    state.pushSubscriptions.push(subscription);
    saveState(state);
  });
}

export function removePushSubscription(id: string): void {
  withStateLock(() => {
    const state = loadState();
    state.pushSubscriptions = state.pushSubscriptions.filter((s) => s.id !== id);
    saveState(state);
  });
}

export function getPushSubscription(id: string): PushSubscriptionState | undefined {
  return loadState().pushSubscriptions.find((s) => s.id === id);
}

export function getAllPushSubscriptions(): PushSubscriptionState[] {
  return loadState().pushSubscriptions;
}

/**
 * Default StateStore implementation using file system
 * Can be replaced with in-memory store for testing
 */
export const defaultStateStore: StateStore = {
  getStateDir,
  getSocketPath,
  loadState,
  saveState,
  getDaemonState,
  setDaemonState,
  clearDaemonState,
  addSession,
  removeSession,
  getSession,
  getSessionByDir,
  getAllSessions,
  getNextPath,
  addShare,
  removeShare,
  getShare,
  getAllShares,
  addPushSubscription,
  removePushSubscription,
  getPushSubscription,
  getAllPushSubscriptions
};
