# Core API ドキュメント

新規 feature を追加する開発者向けの core 機能 API リファレンスです。

## 目次

1. [プロトコル層](#1-プロトコル層)
2. [サーバー API](#2-サーバー-api)
3. [ターミナル API](#3-ターミナル-api)
4. [設定・状態管理](#4-設定状態管理)
5. [セキュリティ](#5-セキュリティ)
6. [Feature 実装パターン](#6-feature-実装パターン)

---

## 1. プロトコル層

**場所:** `src/core/protocol/`

### 1.1 メッセージ型

#### クライアント → サーバー

```typescript
import { ClientMessage, InputMessage, ResizeMessage } from '@/core/protocol/messages.js';

// ターミナル入力
interface InputMessage { type: 'input'; data: string }  // Base64 encoded

// ターミナルリサイズ
interface ResizeMessage { type: 'resize'; cols: number; rows: number }

// ファイル監視
interface WatchFileMessage { type: 'watchFile'; path: string }
interface UnwatchFileMessage { type: 'unwatchFile'; path: string }
interface WatchDirMessage { type: 'watchDir'; path: string }
interface UnwatchDirMessage { type: 'unwatchDir'; path: string }

// Ping/Pong
interface PingMessage { type: 'ping' }
```

#### サーバー → クライアント

```typescript
import { ServerMessage, OutputMessage, createOutputMessage } from '@/core/protocol/messages.js';

// ターミナル出力
interface OutputMessage { type: 'output'; data: string }  // Base64 encoded

// その他
interface TitleMessage { type: 'title'; title: string }
interface ExitMessage { type: 'exit'; code: number }
interface BellMessage { type: 'bell' }
interface ErrorMessage { type: 'error'; message: string }
interface FileChangeMessage { type: 'fileChange'; path: string; timestamp: number }
```

#### ヘルパー関数

```typescript
import {
  parseClientMessage,
  serializeServerMessage,
  createOutputMessage,
  createErrorMessage,
  createExitMessage,
  createBellMessage,
  createFileChangeMessage
} from '@/core/protocol/helpers.js';

// クライアントメッセージのパース
const msg = parseClientMessage(jsonString);  // ClientMessage | null

// サーバーメッセージのシリアライズ
const json = serializeServerMessage(message);

// メッセージ生成
const output = createOutputMessage(Buffer.from('Hello'));  // { type: 'output', data: 'SGVsbG8=' }
const error = createErrorMessage('Something failed');
const exit = createExitMessage(0);
```

### 1.2 Block 型（Warp スタイル UI）

```typescript
import {
  Block,
  ExtendedBlock,
  BlockStatus,
  CommandRequest,
  CommandResponse,
  OutputChunk
} from '@/core/protocol/blocks.js';

// ブロックステータス
type BlockStatus = 'running' | 'success' | 'error';
type ExtendedBlockStatus = 'queued' | 'running' | 'success' | 'error' | 'timeout' | 'canceled';
type ExecutionMode = 'ephemeral' | 'persistent';

// コマンド実行リクエスト
interface CommandRequest {
  command: string;
  mode?: ExecutionMode;        // default: 'ephemeral'
  cwd?: string;
  env?: Record<string, string>;
  tags?: string[];
  timeoutMs?: number;          // default: 300000 (5分)
  captureGitInfo?: boolean;
}

// コマンド実行レスポンス
interface CommandResponse {
  blockId: string;
  correlationId: string;
  status: ExtendedBlockStatus;
}

// 出力チャンク
interface OutputChunk {
  id: string;
  blockId: string;
  stream: 'stdout' | 'stderr';
  seq: number;                 // 単調増加
  content: string;             // Base64 encoded
  timestamp: string;
}
```

#### Block WebSocket メッセージ

```typescript
// ブロック開始
interface BlockStartMessage { type: 'blockStart'; block: Block }

// ブロック出力
interface BlockOutputMessage { type: 'blockOutput'; blockId: string; data: string }

// ブロック終了
interface BlockEndMessage {
  type: 'blockEnd';
  blockId: string;
  exitCode: number;
  endedAt: string;
  endLine: number;
}

// ブロック一覧
interface BlockListMessage { type: 'blockList'; blocks: Block[] }
```

### 1.3 AI 型

```typescript
import { AIStreamMessage, AIFinalMessage, AIErrorMessage } from '@/core/protocol/ai.js';

// ストリーミング中
interface AIStreamMessage {
  type: 'ai_stream';
  runId: string;
  seq: number;
  delta: string;
}

// 完了
interface AIFinalMessage {
  type: 'ai_final';
  runId: string;
  result: {
    content: string;
    citations: AICitation[];
    nextCommands: AINextCommand[];
  };
  usage: { inputTokens: number; outputTokens: number };
  elapsedMs: number;
}

// エラー
interface AIErrorMessage {
  type: 'ai_error';
  runId: string;
  error: string;
  code: 'timeout' | 'canceled' | 'runner_error' | 'rate_limited' | 'unknown';
}
```

---

## 2. サーバー API

**場所:** `src/core/server/`

### 2.1 HTTP ハンドラー

```typescript
import { handleHttpRequest } from '@/core/server/http-handler.js';

// リクエスト処理
async function handleHttpRequest(
  req: Request,
  config: Config,
  sessionManager: NativeSessionManager,
  basePath: string
): Promise<Response>
```

#### 主要 API エンドポイント

| エンドポイント | メソッド | 説明 |
|---------------|---------|------|
| `/api/status` | GET | デーモン・セッション状態 |
| `/api/sessions` | GET | セッション一覧 |
| `/api/sessions` | POST | セッション作成 |
| `/api/sessions/{name}` | DELETE | セッション停止 |
| `/api/sessions/{name}/commands` | POST | コマンド実行 |
| `/api/sessions/{name}/blocks` | GET | ブロック一覧 |
| `/api/blocks/{blockId}` | GET | ブロック詳細 |
| `/api/blocks/{blockId}/cancel` | POST | コマンドキャンセル |
| `/api/blocks/{blockId}/chunks` | GET | 出力チャンク |
| `/api/blocks/{blockId}/stream` | GET | SSE ストリーム |
| `/api/files/*` | GET/POST/DELETE | ファイル操作 |
| `/api/shares` | GET/POST | 共有リンク管理 |

#### 新規エンドポイント追加例

```typescript
// http-handler.ts 内
if (apiPath === '/api/myfeature' && method === 'POST') {
  const body = await req.json();
  // 処理...
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

### 2.2 WebSocket ハンドラー

```typescript
import { createNativeTerminalWebSocketHandlers } from '@/core/server/ws-handler.js';

const { upgrade, websocket } = createNativeTerminalWebSocketHandlers({
  sessionManager,
  basePath: '/bunterm',
  securityConfig: { devMode: false, allowedOrigins: ['https://example.com'] },
  enableTokenAuth: true
});

// Bun.serve で使用
const server = Bun.serve({
  fetch(req, server) {
    if (server.upgrade(req)) return;  // WebSocket アップグレード
    return handleHttpRequest(req, ...);
  },
  websocket
});
```

### 2.3 セッションマネージャー

```typescript
import { NativeSessionManager } from '@/core/server/session-manager.js';

const sessionManager = new NativeSessionManager(config);

// セッション作成
const session = await sessionManager.createSession({
  name: 'dev',
  dir: '/home/user/project',
  path: '/bunterm/dev',
  cols: 80,
  rows: 24
});

// セッション取得
const session = sessionManager.getSession('dev');
const session = sessionManager.getSessionByPath('/bunterm/dev');

// セッション一覧
const sessions = sessionManager.listSessions();
// => [{ name, dir, path, pid, startedAt, clientCount }]

// セッション停止
await sessionManager.stopSession('dev');
await sessionManager.stopAll();

// WebSocket 接続
const session = sessionManager.handleWebSocket('dev', ws);
```

---

## 3. ターミナル API

**場所:** `src/core/terminal/`

### 3.1 TerminalSession

```typescript
import { TerminalSession } from '@/core/terminal/session.js';

// セッション操作
await session.start();
await session.stop();
await session.write('echo hello\n');
session.resize(120, 40);

// クライアント管理
session.addClient(ws);
session.removeClient(ws);
session.handleMessage(ws, messageStr);

// 情報取得
const info = session.getInfo();
// => { name, pid, cwd, cols, rows, clientCount, startedAt }

session.pid;       // プロセス ID
session.exitCode;  // 終了コード (null = 実行中)
session.closed;    // 終了済みか
```

### 3.2 ClientBroadcaster

```typescript
import { ClientBroadcaster } from '@/core/terminal/broadcaster.js';

const broadcaster = new ClientBroadcaster({
  maxOutputBuffer: 1000,  // 保持する出力行数
  replayCount: 100        // 新規クライアントへのリプレイ行数
});

// クライアント管理
broadcaster.addClient(ws);
broadcaster.removeClient(ws);
broadcaster.clientCount;

// ブロードキャスト
broadcaster.broadcast(createOutputMessage(data));
broadcaster.broadcastRaw(jsonString);

// 出力バッファ
broadcaster.bufferOutput(base64Data);
broadcaster.replayTo(ws);  // 新規クライアントに過去出力を送信
broadcaster.getOutputBuffer();
broadcaster.clearOutputBuffer();

// ブロック一覧送信
broadcaster.sendBlockList(ws, blocks);

// 全クライアント切断
broadcaster.closeAll(1000, 'Server shutdown');
```

### 3.3 コマンド実行

```typescript
import { CommandExecutorManager } from '@/core/terminal/command-executor-manager.js';

const executor = new CommandExecutorManager(sessionManager);

// コマンド実行
const response = await executor.executeCommand('dev', {
  command: 'npm test',
  mode: 'ephemeral',     // or 'persistent'
  tags: ['ci'],
  captureGitInfo: true
});
// => { blockId, correlationId, status: 'queued' }

// ブロック取得
const block = executor.getBlock(blockId);
// => { id, command, status, exitCode, stdoutPreview, ... }

// 出力チャンク取得
const chunks = executor.getBlockChunks(blockId, {
  fromSeq: 0,
  stream: 'stdout',
  limit: 100
});

// キャンセル
executor.cancelCommand('dev', blockId, 'SIGTERM');

// セッションのブロック一覧
const blocks = executor.getSessionBlocks('dev');

// イベント購読
const emitter = executor.getEventEmitter();
emitter.on('block.started', (block) => console.log('Started:', block.id));
emitter.on('block.stdout', ({ blockId, chunk }) => console.log('Output:', chunk));
emitter.on('block.completed', (block) => console.log('Done:', block.exitCode));
```

#### 実行モード比較

| モード | 特徴 | ユースケース |
|--------|------|-------------|
| `ephemeral` | 独立プロセスで実行 | CI、バッチ処理 |
| `persistent` | 既存シェルで実行（OSC 633 連携） | インタラクティブ |

---

## 4. 設定・状態管理

**場所:** `src/core/config/`

### 4.1 設定読み込み

```typescript
import { loadConfig, findConfigPath } from '@/core/config/config.js';
import type { Config } from '@/core/config/types.js';

// 設定読み込み
const config = loadConfig();           // 自動検索
const config = loadConfig('/path/to/config.yaml');

// 設定ファイル検索順序
// 1. ./bunterm.yaml
// 2. ./.bunterm.yaml
// 3. ~/.config/bunterm/config.yaml
```

### 4.2 主要設定型

```typescript
interface Config {
  base_path: string;              // "/bunterm"
  daemon_port: number;            // 7680
  listen_addresses: string[];     // ["127.0.0.1", "::1"]
  tmux_mode: 'auto' | 'attach' | 'new' | 'none';

  // サブ設定
  terminal_ui: TerminalUiConfig;
  notifications: NotificationConfig;
  file_transfer: FileTransferConfig;
  preview: PreviewConfig;
  security: SecurityConfig;
  ai_chat: AIChatConfig;
  native_terminal: NativeTerminalConfig;
}

interface NativeTerminalConfig {
  enabled: boolean;
  default_shell: string;          // '/bin/bash'
  scrollback: number;             // 10000
  output_buffer_size: number;     // 1000
}

interface SecurityConfig {
  dev_mode: boolean;
  allowed_origins: string[];
  enable_ws_token_auth: boolean;
  ws_token_ttl_seconds: number;   // 30
}
```

### 4.3 状態管理

```typescript
import {
  loadState,
  saveState,
  getStateDir,
  getSocketPath
} from '@/core/config/state.js';

// パス取得
getStateDir();    // ~/.local/state/bunterm
getSocketPath();  // ~/.local/state/bunterm/bunterm.sock

// 状態読み込み
const state = loadState();
// => { daemon, sessions, shares, pushSubscriptions }

// 状態更新
state.sessions.push({
  name: 'dev',
  pid: 12345,
  path: '/bunterm/dev',
  dir: '/home/user/project',
  started_at: new Date().toISOString()
});
saveState(state);

// ファイルロック付きで安全に更新
```

---

## 5. セキュリティ

**場所:** `src/core/server/ws/`

### 5.1 Origin 検証

```typescript
import { validateOrigin, createSecurityConfig } from '@/core/server/ws/origin-validator.js';

const securityConfig = createSecurityConfig({
  devMode: false,
  allowedOrigins: ['https://example.com', 'https://app.example.com']
});

const result = validateOrigin(request, securityConfig);
if (!result.allowed) {
  return new Response('Forbidden', { status: 403 });
}
```

### 5.2 WebSocket トークン認証

```typescript
import {
  TokenGenerator,
  extractBearerToken,
  createBearerProtocol
} from '@/core/server/ws/session-token.js';

// トークン生成（サーバー側）
const generator = new TokenGenerator(secretKey, { ttlSeconds: 30 });
const token = generator.generate(sessionId, userId);

// クライアント側：WebSocket 接続時
const ws = new WebSocket(url, [createBearerProtocol(token)]);

// サーバー側：トークン検証
const protocols = request.headers.get('sec-websocket-protocol');
const token = extractBearerToken(protocols);
const validation = await generator.validate(token);

if (!validation.valid) {
  return new Response('Unauthorized', { status: 401 });
}
// validation.session.sid でセッション ID 取得
```

### 5.3 パスセキュリティ

```typescript
import { validateSecurePath } from '@/utils/path-security.js';

const baseDir = '/home/user/project';
const userPath = '../../../etc/passwd';  // 悪意あるパス

const result = validateSecurePath(baseDir, userPath);
if (!result.valid) {
  return new Response(result.error, { status: 403 });
}
// result.targetPath を安全に使用可能
```

---

## 6. Feature 実装パターン

### 6.1 新規 API エンドポイント追加

```typescript
// 1. 型定義 (src/features/myfeature/types.ts)
export interface MyFeatureRequest {
  action: string;
  data: unknown;
}

export interface MyFeatureResponse {
  success: boolean;
  result?: unknown;
}

// 2. サーバー側実装 (src/features/myfeature/server/handler.ts)
export async function handleMyFeature(
  req: Request,
  session: TerminalSession
): Promise<Response> {
  const body = await req.json() as MyFeatureRequest;
  // 処理...
  return Response.json({ success: true, result: ... });
}

// 3. HTTP ハンドラーに統合 (http-handler.ts)
if (apiPath.startsWith('/api/myfeature')) {
  return handleMyFeature(req, session);
}
```

### 6.2 WebSocket メッセージ追加

```typescript
// 1. プロトコル型追加 (src/core/protocol/messages.ts)
export interface MyFeatureMessage {
  type: 'myfeature';
  data: string;
}

// ServerMessage union に追加
export type ServerMessage = OutputMessage | ... | MyFeatureMessage;

// 2. ヘルパー関数追加 (src/core/protocol/helpers.ts)
export function createMyFeatureMessage(data: string): MyFeatureMessage {
  return { type: 'myfeature', data };
}

// 3. ブロードキャスト
session.broadcaster.broadcast(createMyFeatureMessage('Hello'));
```

### 6.3 ファイル操作を含む Feature

```typescript
import { validateSecurePath } from '@/utils/path-security.js';
import { readFile, writeFile } from 'node:fs/promises';

export async function handleFileOperation(
  session: TerminalSession,
  relativePath: string
): Promise<Response> {
  // パス検証（必須）
  const pathResult = validateSecurePath(session.cwd, relativePath);
  if (!pathResult.valid) {
    return Response.json({ error: pathResult.error }, { status: 403 });
  }

  // 安全なパスで操作
  const content = await readFile(pathResult.targetPath, 'utf-8');
  return Response.json({ content });
}
```

### 6.4 ブラウザ側クライアント実装

```typescript
// src/features/myfeature/client/MyFeatureClient.ts
import { type Mountable, type Scope, on } from '@/browser/shared/lifecycle.js';

export class MyFeatureClient implements Mountable {
  private config: TerminalUiConfig;
  private elements: { btn: HTMLElement } | null = null;

  constructor(config: TerminalUiConfig) {
    this.config = config;
  }

  bindElements(elements: { btn: HTMLElement }): void {
    this.elements = elements;
  }

  mount(scope: Scope): void {
    if (!this.elements) return;

    scope.add(on(this.elements.btn, 'click', () => this.handleClick()));
  }

  private async handleClick(): Promise<void> {
    const response = await fetch(`${this.config.base_path}/api/myfeature`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'doSomething' })
    });
    const result = await response.json();
    console.log(result);
  }
}
```

### 6.5 Feature ディレクトリ構造

```
src/features/myfeature/
├── server/
│   ├── handler.ts      # HTTP ハンドラー
│   ├── service.ts      # ビジネスロジック
│   └── index.ts        # エクスポート
├── client/
│   ├── MyFeatureClient.ts
│   └── index.ts
├── types.ts            # 共通型定義
└── index.ts            # モジュールエクスポート
```

---

## 7. 参考リンク

- [CLAUDE.md](../CLAUDE.md) - プロジェクト概要とコーディング規約
- [ADR 009: Dependency Injection](./adr/009-dependency-injection-for-testability.md) - テスト容易性のための DI パターン
- [core/protocol/](../src/core/protocol/) - プロトコル型定義
- [core/server/](../src/core/server/) - サーバー実装
- [core/terminal/](../src/core/terminal/) - ターミナル実装
