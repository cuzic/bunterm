import { z } from 'zod';

// === 設定ファイル (config.yaml) ===

export const TmuxModeSchema = z.enum(['auto', 'attach', 'new', 'none']);
export type TmuxMode = z.infer<typeof TmuxModeSchema>;

export const SessionDefinitionSchema = z.object({
  name: z.string().min(1),
  dir: z.string().min(1),
  path: z.string().startsWith('/'),
  port_offset: z.number().int().min(0)
});

export type SessionDefinition = z.infer<typeof SessionDefinitionSchema>;

export const TerminalUiConfigSchema = z.object({
  font_size_default_mobile: z.number().int().min(8).max(72).default(32),
  font_size_default_pc: z.number().int().min(8).max(72).default(14),
  font_size_min: z.number().int().min(6).max(20).default(10),
  font_size_max: z.number().int().min(24).max(96).default(48),
  double_tap_delay: z.number().int().min(100).max(1000).default(300),
  reconnect_retries: z.number().int().min(0).max(10).default(3),
  reconnect_interval: z.number().int().min(500).max(10000).default(2000)
});

export type TerminalUiConfig = z.infer<typeof TerminalUiConfigSchema>;

/** Default terminal UI configuration */
export const DEFAULT_TERMINAL_UI_CONFIG: TerminalUiConfig = {
  font_size_default_mobile: 32,
  font_size_default_pc: 14,
  font_size_min: 10,
  font_size_max: 48,
  double_tap_delay: 300,
  reconnect_retries: 3,
  reconnect_interval: 2000
};

export const FileTransferConfigSchema = z.object({
  enabled: z.boolean().default(true),
  max_file_size: z
    .number()
    .int()
    .min(1024)
    .default(100 * 1024 * 1024), // 100MB
  allowed_extensions: z.array(z.string()).default([])
});

export type FileTransferConfig = z.infer<typeof FileTransferConfigSchema>;

/** Default file transfer configuration */
export const DEFAULT_FILE_TRANSFER_CONFIG: FileTransferConfig = {
  enabled: true,
  max_file_size: 100 * 1024 * 1024, // 100MB
  allowed_extensions: []
};

export const NotificationPatternSchema = z.object({
  regex: z.string().min(1),
  message: z.string().min(1),
  cooldown: z.number().int().min(0).optional()
});

export type NotificationPatternConfig = z.infer<typeof NotificationPatternSchema>;

export const NotificationConfigSchema = z.object({
  enabled: z.boolean().default(true),
  contact_email: z.string().email().optional(),
  bell_notification: z.boolean().default(true),
  bell_cooldown: z.number().int().min(0).default(10),
  patterns: z.array(NotificationPatternSchema).default([]),
  default_cooldown: z.number().int().min(0).default(300)
});

export type NotificationConfig = z.infer<typeof NotificationConfigSchema>;

/** Default notification configuration */
export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  enabled: true,
  bell_notification: true,
  bell_cooldown: 10,
  patterns: [],
  default_cooldown: 300
};

export const TabsOrientationSchema = z.enum(['horizontal', 'vertical']);
export type TabsOrientation = z.infer<typeof TabsOrientationSchema>;

export const TabsPositionSchema = z.enum(['left', 'right', 'top', 'bottom']);
export type TabsPosition = z.infer<typeof TabsPositionSchema>;

export const TabsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  orientation: TabsOrientationSchema.default('vertical'),
  position: TabsPositionSchema.default('left'),
  tab_width: z.number().int().min(100).max(400).default(200),
  tab_height: z.number().int().min(30).max(100).default(40),
  auto_refresh_interval: z.number().int().min(1000).max(60000).default(5000),
  preload_iframes: z.boolean().default(false),
  show_session_info: z.boolean().default(true)
});

export type TabsConfig = z.infer<typeof TabsConfigSchema>;

/** Default tabs configuration */
export const DEFAULT_TABS_CONFIG: TabsConfig = {
  enabled: true,
  orientation: 'vertical',
  position: 'left',
  tab_width: 200,
  tab_height: 40,
  auto_refresh_interval: 5000,
  preload_iframes: false,
  show_session_info: true
};

export const StaticServingConfigSchema = z.object({
  enabled: z.boolean().default(true),
  allowed_extensions: z
    .array(z.string())
    .default([
      '.html',
      '.htm',
      '.js',
      '.mjs',
      '.css',
      '.json',
      '.png',
      '.jpg',
      '.jpeg',
      '.gif',
      '.svg',
      '.ico',
      '.woff',
      '.woff2',
      '.ttf',
      '.eot',
      '.webp',
      '.mp4',
      '.webm',
      '.ogg',
      '.mp3',
      '.wav'
    ]),
  spa_fallback: z.boolean().default(true),
  max_file_size: z
    .number()
    .int()
    .min(1024)
    .default(50 * 1024 * 1024) // 50MB
});

export type StaticServingConfig = z.infer<typeof StaticServingConfigSchema>;

/** Default static serving configuration */
export const DEFAULT_STATIC_SERVING_CONFIG: StaticServingConfig = {
  enabled: true,
  allowed_extensions: [
    '.html',
    '.htm',
    '.js',
    '.mjs',
    '.css',
    '.json',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.svg',
    '.ico',
    '.woff',
    '.woff2',
    '.ttf',
    '.eot',
    '.webp',
    '.mp4',
    '.webm',
    '.ogg',
    '.mp3',
    '.wav'
  ],
  spa_fallback: true,
  max_file_size: 50 * 1024 * 1024 // 50MB
};

export const PreviewConfigSchema = z.object({
  enabled: z.boolean().default(true),
  default_width: z.number().int().min(200).max(1200).default(400),
  debounce_ms: z.number().int().min(50).max(2000).default(300),
  auto_refresh: z.boolean().default(true),
  allowed_extensions: z.array(z.string()).default(['.html', '.htm', '.md', '.txt']),
  static_serving: StaticServingConfigSchema.default(DEFAULT_STATIC_SERVING_CONFIG)
});

export type PreviewConfig = z.infer<typeof PreviewConfigSchema>;

/** Default preview configuration */
export const DEFAULT_PREVIEW_CONFIG: PreviewConfig = {
  enabled: true,
  default_width: 400,
  debounce_ms: 300,
  auto_refresh: true,
  allowed_extensions: ['.html', '.htm', '.md', '.txt'],
  static_serving: DEFAULT_STATIC_SERVING_CONFIG
};

export const DirectoryBrowserConfigSchema = z.object({
  enabled: z.boolean().default(false),
  allowed_directories: z.array(z.string()).default([])
});

export type DirectoryBrowserConfig = z.infer<typeof DirectoryBrowserConfigSchema>;

/** Default directory browser configuration */
export const DEFAULT_DIRECTORY_BROWSER_CONFIG: DirectoryBrowserConfig = {
  enabled: false,
  allowed_directories: []
};

export const SentryConfigSchema = z.object({
  enabled: z.boolean().default(false),
  dsn: z.string().optional(),
  environment: z.string().default('production'),
  sample_rate: z.number().min(0).max(1).default(1.0),
  traces_sample_rate: z.number().min(0).max(1).default(0.1),
  release: z.string().optional(),
  debug: z.boolean().default(false)
});

export type SentryConfig = z.infer<typeof SentryConfigSchema>;

/** Default Sentry configuration */
export const DEFAULT_SENTRY_CONFIG: SentryConfig = {
  enabled: false,
  environment: 'production',
  sample_rate: 1.0,
  traces_sample_rate: 0.1,
  debug: false
};

export const SessionBackendSchema = z.enum(['ttyd', 'native']);
export type SessionBackend = z.infer<typeof SessionBackendSchema>;

export const NativeTerminalConfigSchema = z.object({
  enabled: z.boolean().default(false),
  default_shell: z.string().default('/bin/bash'),
  scrollback: z.number().int().min(100).max(100000).default(10000),
  output_buffer_size: z.number().int().min(100).max(10000).default(1000)
});

export type NativeTerminalConfig = z.infer<typeof NativeTerminalConfigSchema>;

/** Default native terminal configuration */
export const DEFAULT_NATIVE_TERMINAL_CONFIG: NativeTerminalConfig = {
  enabled: false,
  default_shell: '/bin/bash',
  scrollback: 10000,
  output_buffer_size: 1000
};

export const AIChatConfigSchema = z.object({
  enabled: z.boolean().default(true),
  default_runner: z.enum(['claude', 'codex', 'gemini', 'auto']).default('auto'),
  cache_enabled: z.boolean().default(true),
  cache_ttl_ms: z.number().int().min(0).default(3600000), // 1 hour
  rate_limit_enabled: z.boolean().default(true),
  rate_limit_max_requests: z.number().int().min(1).max(100).default(20),
  rate_limit_window_ms: z.number().int().min(1000).default(60000) // 1 minute
});

export type AIChatConfig = z.infer<typeof AIChatConfigSchema>;

/** Default AI chat configuration */
export const DEFAULT_AI_CHAT_CONFIG: AIChatConfig = {
  enabled: true,
  default_runner: 'auto',
  cache_enabled: true,
  cache_ttl_ms: 3600000,
  rate_limit_enabled: true,
  rate_limit_max_requests: 20,
  rate_limit_window_ms: 60000
};

export const SecurityConfigSchema = z.object({
  dev_mode: z.boolean().default(false),
  allowed_origins: z.array(z.string()).default([]),
  enable_ws_token_auth: z.boolean().default(false),
  ws_token_ttl_seconds: z.number().int().min(10).max(300).default(30)
});

export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;

/** Default security configuration */
export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  dev_mode: false,
  allowed_origins: [],
  enable_ws_token_auth: false,
  ws_token_ttl_seconds: 30
};

export const ConfigSchema = z.object({
  base_path: z.string().startsWith('/').default('/ttyd-mux'),
  base_port: z.number().int().min(1024).max(65535).default(7600),
  daemon_port: z.number().int().min(1024).max(65535).default(7680),
  listen_addresses: z.array(z.string()).default(['127.0.0.1', '::1']),
  listen_sockets: z.array(z.string()).default([]),
  auto_attach: z.boolean().default(true),
  sessions: z.array(SessionDefinitionSchema).default([]),
  proxy_mode: z.enum(['proxy', 'static']).default('proxy'),
  hostname: z.string().optional(),
  caddy_admin_api: z.string().default('http://localhost:2019'),
  tmux_mode: TmuxModeSchema.default('auto'),
  session_backend: SessionBackendSchema.default('ttyd'),
  terminal_ui: TerminalUiConfigSchema.default(DEFAULT_TERMINAL_UI_CONFIG),
  notifications: NotificationConfigSchema.default(DEFAULT_NOTIFICATION_CONFIG),
  file_transfer: FileTransferConfigSchema.default(DEFAULT_FILE_TRANSFER_CONFIG),
  tabs: TabsConfigSchema.default(DEFAULT_TABS_CONFIG),
  preview: PreviewConfigSchema.default(DEFAULT_PREVIEW_CONFIG),
  directory_browser: DirectoryBrowserConfigSchema.default(DEFAULT_DIRECTORY_BROWSER_CONFIG),
  sentry: SentryConfigSchema.default(DEFAULT_SENTRY_CONFIG),
  native_terminal: NativeTerminalConfigSchema.default(DEFAULT_NATIVE_TERMINAL_CONFIG),
  ai_chat: AIChatConfigSchema.default(DEFAULT_AI_CHAT_CONFIG),
  security: SecurityConfigSchema.default(DEFAULT_SECURITY_CONFIG)
});

export type Config = z.infer<typeof ConfigSchema>;

// === 状態ファイル (state.json) ===

export interface DaemonState {
  pid: number;
  port: number;
  started_at: string;
}

export interface SessionState {
  name: string;
  pid: number;
  port: number;
  path: string;
  dir: string;
  started_at: string;
}

export interface ShareState {
  token: string;
  sessionName: string;
  createdAt: string;
  expiresAt: string;
  password?: string;
}

export interface PushSubscriptionState {
  id: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  sessionName?: string;
  createdAt: string;
}

export interface State {
  daemon: DaemonState | null;
  sessions: SessionState[];
  shares: ShareState[];
  pushSubscriptions: PushSubscriptionState[];
}

// === 解決済みセッション（設定 + 状態を統合）===

export interface ResolvedSession {
  name: string;
  dir: string;
  path: string;
  fullPath: string; // base_path + path
  port: number;
  running: boolean;
  pid?: number;
}

// === API リクエスト/レスポンス ===

export interface StartSessionRequest {
  name: string;
  dir: string;
  path?: string; // 省略時は name から生成
}

export interface SessionResponse {
  name: string;
  port: number;
  path: string;
  fullPath: string;
  dir: string;
  pid: number;
  started_at: string;
}

export interface StatusResponse {
  daemon: DaemonState;
  sessions: SessionResponse[];
}

export interface ErrorResponse {
  error: string;
}
