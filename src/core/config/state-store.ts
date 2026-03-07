/**
 * StateStore interface for abstracting state management
 * Allows in-memory state store for testing without file system access
 */

import type {
  DaemonState,
  PushSubscriptionState,
  SessionState,
  ShareState,
  State
} from './types.js';

// Re-export defaultStateStore from state.ts for convenience
export { defaultStateStore } from './state.js';

export interface StateStore {
  // Path accessors
  getStateDir(): string;
  getSocketPath(): string;

  // Raw state access
  loadState(): State;
  saveState(state: State): void;

  // Daemon state
  getDaemonState(): DaemonState | null;
  setDaemonState(daemon: DaemonState): void;
  clearDaemonState(): void;

  // Session state
  addSession(session: SessionState): void;
  removeSession(name: string): void;
  getSession(name: string): SessionState | undefined;
  getSessionByDir(dir: string): SessionState | undefined;
  getAllSessions(): SessionState[];

  // Utilities
  getNextPath(basePath: string, name: string): string;

  // Share state
  addShare(share: ShareState): void;
  removeShare(token: string): void;
  getShare(token: string): ShareState | undefined;
  getAllShares(): ShareState[];

  // Push subscription state
  addPushSubscription(subscription: PushSubscriptionState): void;
  removePushSubscription(id: string): void;
  getPushSubscription(id: string): PushSubscriptionState | undefined;
  getAllPushSubscriptions(): PushSubscriptionState[];
}

/**
 * Create an in-memory StateStore for testing
 */
export function createInMemoryStateStore(initialState?: Partial<State>): StateStore {
  let state: State = {
    daemon: initialState?.daemon ?? null,
    sessions: initialState?.sessions ?? [],
    shares: initialState?.shares ?? [],
    pushSubscriptions: initialState?.pushSubscriptions ?? []
  };

  return {
    getStateDir: () => '/tmp/test-state',
    getSocketPath: () => '/tmp/test-state/bunterm.sock',

    loadState: () => ({ ...state, sessions: [...state.sessions] }),
    saveState: (newState: State) => {
      state = { ...newState, sessions: [...newState.sessions] };
    },

    getDaemonState: () => state.daemon,
    setDaemonState: (daemon: DaemonState) => {
      state.daemon = daemon;
    },
    clearDaemonState: () => {
      state.daemon = null;
    },

    addSession: (session: SessionState) => {
      state.sessions = state.sessions.filter((s) => s.name !== session.name);
      state.sessions.push(session);
    },
    removeSession: (name: string) => {
      state.sessions = state.sessions.filter((s) => s.name !== name);
    },
    getSession: (name: string) => state.sessions.find((s) => s.name === name),
    getSessionByDir: (dir: string) => state.sessions.find((s) => s.dir === dir),
    getAllSessions: () => [...state.sessions],

    getNextPath: (basePath: string, name: string) => {
      return `${basePath}/${name}`.replace(/\/+/g, '/');
    },

    addShare: (share: ShareState) => {
      state.shares = state.shares.filter((s) => s.token !== share.token);
      state.shares.push(share);
    },
    removeShare: (token: string) => {
      state.shares = state.shares.filter((s) => s.token !== token);
    },
    getShare: (token: string) => state.shares.find((s) => s.token === token),
    getAllShares: () => [...state.shares],

    addPushSubscription: (subscription: PushSubscriptionState) => {
      state.pushSubscriptions = state.pushSubscriptions.filter(
        (s) => s.endpoint !== subscription.endpoint
      );
      state.pushSubscriptions.push(subscription);
    },
    removePushSubscription: (id: string) => {
      state.pushSubscriptions = state.pushSubscriptions.filter((s) => s.id !== id);
    },
    getPushSubscription: (id: string) => state.pushSubscriptions.find((s) => s.id === id),
    getAllPushSubscriptions: () => [...state.pushSubscriptions]
  };
}
