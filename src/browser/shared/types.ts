/**
 * Toolbar Client Type Definitions
 *
 * Types for the browser-side toolbar implementation.
 */

/** Terminal interface (subset of xterm.js Terminal) */
export interface Terminal {
  options: {
    fontSize?: number;
  };
  element?: HTMLElement;
  buffer: {
    active: TerminalBuffer;
  };
  getSelection(): string;
  loadAddon(addon: unknown): void;
  onBell(callback: () => void): void;
  scrollLines(amount: number): void;
  refresh(start: number, end: number): void;
}

/** Terminal buffer interface */
export interface TerminalBuffer {
  length: number;
  getLine(index: number): TerminalLine | undefined;
}

/** Terminal line interface */
export interface TerminalLine {
  translateToString(trimRight?: boolean): string;
}

/** Search result change event data */
export interface SearchResultsChangeEvent {
  resultIndex: number;
  resultCount: number;
}

/** Search addon interface */
export interface SearchAddon {
  findNext(term: string, options?: SearchOptions): boolean;
  findPrevious(term: string, options?: SearchOptions): boolean;
  clearDecorations?(): void;
  onDidChangeResults?: (callback: (results: SearchResultsChangeEvent | undefined) => void) => void;
}

/** Search options */
export interface SearchOptions {
  caseSensitive?: boolean;
  regex?: boolean;
  incremental?: boolean;
}

/** Fit addon interface */
export interface FitAddon {
  fit(): void;
}

/** Web links addon interface */
export interface WebLinksAddon {
  // WebLinksAddon is loaded and attached to terminal, no public methods needed
  dispose?(): void;
}

/** Client-side Sentry configuration (subset of server config) */
export interface ClientSentryConfig {
  enabled: boolean;
  dsn?: string;
  environment: string;
  sample_rate: number;
}

/** Toolbar configuration from server */
export interface TerminalUiConfig {
  base_path: string;
  font_size_min: number;
  font_size_max: number;
  font_size_default_mobile: number;
  font_size_default_pc: number;
  double_tap_delay: number;
  reconnect_retries: number;
  reconnect_interval: number;
  preview_allowed_extensions?: string[];
  sentry?: ClientSentryConfig;
  /** tmux mode: 'none' | 'auto' | 'new' | 'attach' */
  tmuxMode?: string;
  /** Session name (provided by server in native terminal mode) */
  sessionName?: string;
  /** Session path (provided by server in native terminal mode) */
  sessionPath?: string;
  /** Whether this is a shared (read-only) view */
  isShared?: boolean;
  /** Whether this is native terminal mode */
  isNativeTerminal?: boolean;
  /** Current working directory of the session */
  cwd?: string;
}

/** DOM element IDs for toolbar */
export interface ToolbarElements {
  container: HTMLElement;
  input: HTMLTextAreaElement;
  sendBtn: HTMLButtonElement;
  enterBtn: HTMLButtonElement;
  zoomInBtn: HTMLButtonElement;
  zoomOutBtn: HTMLButtonElement;
  runBtn: HTMLButtonElement;
  toggleBtn: HTMLButtonElement;
  ctrlBtn: HTMLButtonElement;
  altBtn: HTMLButtonElement;
  shiftBtn: HTMLButtonElement;
  escBtn: HTMLButtonElement;
  tabBtn: HTMLButtonElement;
  bsBtn: HTMLButtonElement;
  upBtn: HTMLButtonElement;
  downBtn: HTMLButtonElement;
  copyAllBtn: HTMLButtonElement;
  pasteBtn: HTMLButtonElement;
  autoBtn: HTMLButtonElement;
  minimizeBtn: HTMLButtonElement;
  notifyBtn: HTMLButtonElement;
  shareBtn: HTMLButtonElement;
  snippetBtn: HTMLButtonElement;
  downloadBtn: HTMLButtonElement;
  uploadBtn: HTMLButtonElement;
  previewBtn: HTMLButtonElement;
  // Share modal elements
  shareModal: HTMLElement;
  shareModalClose: HTMLButtonElement;
  shareCreate: HTMLButtonElement;
  shareResult: HTMLElement;
  shareUrl: HTMLInputElement;
  shareCopy: HTMLButtonElement;
  shareQr: HTMLButtonElement;
  // Search bar elements
  searchBar: HTMLElement;
  searchInput: HTMLInputElement;
  searchCount: HTMLElement;
  searchPrevBtn: HTMLButtonElement;
  searchNextBtn: HTMLButtonElement;
  searchCaseBtn: HTMLButtonElement;
  searchRegexBtn: HTMLButtonElement;
  searchCloseBtn: HTMLButtonElement;
  searchToolbarBtn: HTMLButtonElement;
}

/** localStorage keys */
export const STORAGE_KEYS = {
  FONT_SIZE: 'tui-font-size',
  ONBOARDING_SHOWN: 'tui-onboarding-shown',
  AUTO_RUN: 'tui-auto-run',
  NOTIFY_SUBSCRIPTION: 'bunterm-notify-subscription',
  SNIPPETS: 'bunterm-snippets',
  CLIPBOARD_HISTORY: 'bunterm-clipboard-history'
} as const;

/** Snippet definition */
export interface Snippet {
  id: string;
  name: string;
  command: string;
  createdAt: string;
}

/** Snippet storage format */
export interface SnippetStorage {
  version: number;
  snippets: Snippet[];
}

/** Snippet modal elements */
export interface SnippetElements {
  snippetBtn: HTMLButtonElement;
  modal: HTMLElement;
  modalClose: HTMLButtonElement;
  addBtn: HTMLButtonElement;
  importBtn: HTMLButtonElement;
  exportBtn: HTMLButtonElement;
  searchInput: HTMLInputElement;
  list: HTMLElement;
  addForm: HTMLElement;
  addNameInput: HTMLInputElement;
  addCommandInput: HTMLTextAreaElement;
  addSaveBtn: HTMLButtonElement;
  addCancelBtn: HTMLButtonElement;
}

/** Clipboard history item */
export interface ClipboardHistoryItem {
  id: string;
  text: string;
  timestamp: string;
}

/** Clipboard history storage format */
export interface ClipboardHistoryStorage {
  version: number;
  items: ClipboardHistoryItem[];
}

/** Smart paste content types */
export type SmartPasteContentType =
  | { type: 'text'; data: string }
  | { type: 'image'; blob: Blob; dataUrl: string; name?: string }
  | { type: 'file'; file: File }
  | { type: 'html'; html: string; text: string };

/** Pending upload item for preview - re-exported from toolbar */
export type { PendingUpload } from '@/browser/toolbar/smartPasteMachine.js';

/** Session switcher modal elements */
export interface SessionSwitcherElements {
  modal: HTMLElement;
  modalClose: HTMLButtonElement;
  refreshBtn: HTMLButtonElement;
  searchInput: HTMLInputElement;
  sessionList: HTMLElement;
  sessionBtn: HTMLButtonElement;
}

/** Smart paste modal elements */
export interface SmartPasteElements {
  previewModal: HTMLElement;
  previewClose: HTMLButtonElement;
  previewImg: HTMLImageElement;
  previewPrev: HTMLButtonElement;
  previewNext: HTMLButtonElement;
  previewCounter: HTMLElement;
  previewDots: HTMLElement;
  previewRemove: HTMLButtonElement;
  previewCancel: HTMLButtonElement;
  previewSubmit: HTMLButtonElement;
  dropZone: HTMLElement;
}

/** Declare global window extensions */
declare global {
  interface Window {
    __TERMINAL_UI_CONFIG__: TerminalUiConfig;
    term?: Terminal;
    socket?: WebSocket;
    fitAddon?: FitAddon;
    SearchAddon?: {
      SearchAddon: new () => SearchAddon;
    };
    WebLinksAddon?: {
      WebLinksAddon: new (handler: (event: MouseEvent, uri: string) => void) => WebLinksAddon;
    };
    Sentry?: {
      captureException(error: unknown): void;
      captureMessage(message: string, level?: string): void;
    };
    /** Initialization function for native terminal mode */
    initTerminalUi?: () => void;
  }
}
