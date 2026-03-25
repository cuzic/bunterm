# ADR 038: Bun.Terminal ベースのネイティブターミナル実装

## Status

Proposed

## Context

将来的な AI 機能（Warp 風のコマンド提案、エラー説明、Agent Mode 等）の実装を見据え、現在の ttyd ベースアーキテクチャの限界を調査した。

### 現在のアーキテクチャ

```
Browser                     ttyd-mux                    ttyd
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│ xterm.js         │       │ ws-proxy         │       │ PTY              │
│ + terminal-ui.js │◄─────►│ (中継のみ)       │◄─────►│ (WebSocket + PTY)│
└──────────────────┘       └──────────────────┘       └──────────────────┘
```

### ttyd の限界

| 能力 | 状態 | 備考 |
|------|------|------|
| 入力インターセプト | ✅ 可能 | ws-proxy で実現 |
| 出力監視 | ✅ 可能 | ws-proxy で実現 |
| ターミナル状態取得 | ❌ 不可 | ttyd にバッファ API なし |
| フロー制御 | ⚠️ 部分的 | pause/resume 限定 |
| PTY 直接制御 | ❌ 不可 | 外部プロセス |

### Bun.Terminal の可能性

Bun v1.3.5 で追加された `Bun.Terminal` API により、Bun から直接 PTY を管理できるようになった：

```typescript
const proc = Bun.spawn(["bash"], {
  terminal: {
    cols: 80,
    rows: 24,
    data(terminal, data) {
      // PTY 出力をリアルタイムで受信
      broadcast(data);
    },
  },
});

proc.terminal.write("echo hello\n");
proc.terminal.resize(120, 40);
```

## Decision

**ttyd を Bun.Terminal ベースの自前実装に置き換える**アーキテクチャを採用する。

### 新アーキテクチャ

```
Browser                     ttyd-mux
┌──────────────────┐       ┌──────────────────────────────────────────┐
│ xterm.js         │       │ WebSocket Server                         │
│ + terminal-ui.js │◄─────►│ + TerminalSession (Bun.Terminal)         │
│ + terminal-client│       │ + NativeSessionManager                   │
└──────────────────┘       │ + Output Buffer (AI 用)                  │
                           └──────────────────────────────────────────┘
                                    │
                                    ▼ PTY
                           ┌──────────────────┐
                           │ tmux / bash      │
                           └──────────────────┘
```

### WebSocket プロトコル設計

ttyd のバイナリプロトコルを廃止し、新しい JSON ベースのプロトコルを採用：

```typescript
// クライアント → サーバー
type ClientMessage =
  | { type: 'input'; data: string }        // ターミナル入力
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'ping' }

// サーバー → クライアント
type ServerMessage =
  | { type: 'output'; data: string }       // ターミナル出力 (Base64)
  | { type: 'title'; title: string }
  | { type: 'exit'; code: number }
  | { type: 'pong' }
  | { type: 'error'; message: string }
```

**JSON 採用の理由**：
- デバッグしやすい（ログで可読）
- 拡張しやすい（新しいメッセージタイプ追加）
- 型安全（TypeScript で厳密に定義）

**バイナリデータの扱い**：
- `output` の `data` は Base64 エンコード（UTF-8 外のバイナリに対応）
- 将来的にパフォーマンス問題があれば `ArrayBuffer` 型を追加

### 実装コンポーネント

| コンポーネント | 責務 |
|---------------|------|
| `TerminalSession` | 単一 PTY セッションの管理、Bun.Terminal ラッパー |
| `NativeSessionManager` | 複数セッションの管理、セッションライフサイクル |
| `WebSocketServer` | クライアント接続、プロトコル処理 |
| `terminal-client.js` | xterm.js 初期化、WebSocket 通信 |

### xterm.js の配信

ttyd が配信していた xterm.js を自前でバンドルして配信：

```bash
# 必要な依存
bun add @xterm/xterm @xterm/addon-fit @xterm/addon-web-links @xterm/addon-unicode11
```

**バンドル構成**：
- `xterm-bundle.js`: xterm.js + addons
- `terminal-client.js`: WebSocket 通信、xterm 初期化
- `terminal-ui.js`: 既存の UI 機能

### HTML テンプレート

ttyd の HTML を使用せず、完全な HTML を自前生成：

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Session Name - ttyd-mux</title>
  <link rel="stylesheet" href="/ttyd-mux/xterm.css">
  <style>/* terminal-ui styles */</style>
</head>
<body>
  <div id="terminal"></div>
  <!-- terminal-ui HTML -->
  <script src="/ttyd-mux/xterm-bundle.js"></script>
  <script src="/ttyd-mux/terminal-client.js"></script>
  <script src="/ttyd-mux/terminal-ui.js"></script>
</body>
</html>
```

### 設定スキーマ拡張

```yaml
native_terminal:
  enabled: true            # ネイティブターミナル有効化
  default_shell: "/bin/bash"  # デフォルトシェル
  scrollback: 10000        # スクロールバック行数
  output_buffer_size: 1000 # 出力バッファサイズ (AI 用)
```

### 複数クライアント対応

- 各セッションに接続クライアント Set を保持
- 出力は全クライアントにブロードキャスト
- 入力は全クライアントから受け付け（後勝ち）

### 移行戦略

1. **Phase 1**: ttyd と並行して新規ネイティブセッションを作成可能に
2. **Phase 2**: 全機能の動作確認後、デフォルトをネイティブに変更
3. **Phase 3**: ttyd 依存を完全に削除

## Consequences

### Positive

- **PTY 完全制御**: ターミナルバッファへの直接アクセス
- **単一プロセス**: ttyd プロセス管理が不要に
- **低レイテンシ**: プロキシ層の削除
- **AI 機能対応**: Agent Mode を含む全 AI 機能が実装可能
- **拡張性**: プロトコル自由に設計可能
- **ゼロ外部依存**: ttyd のインストールが不要に

### Negative

- **xterm.js バンドル**: 自前でクライアント側 JS を配信
- **ZMODEM 非対応**: ファイル転送は HTTP API で代替
- **POSIX 限定**: Windows 非対応（Bun.Terminal の制限）
- **開発工数**: 新規実装が必要

### ZMODEM について

ttyd がサポートしていた ZMODEM (`lrzsz`) は非対応とする。
既存の HTTP ファイル転送 API (`/api/files/*`) で十分な機能を提供。

### 非対応機能

- ZMODEM ファイル転送
- ttyd 固有の認証機能（Basic 認証、クライアント証明書）
- Windows プラットフォーム

## Implementation Details

### ファイル構成

```
src/daemon/native-terminal/
├── index.ts               # モジュールエクスポート
├── types.ts               # 型定義（ClientMessage, ServerMessage）
├── terminal-session.ts    # TerminalSession クラス
├── session-manager.ts     # NativeSessionManager
├── ws-handler.ts          # WebSocket ハンドラ
└── html-template.ts       # HTML 生成

src/daemon/terminal-ui/
├── client/
│   ├── terminal-client.ts # xterm.js 初期化、WebSocket 通信
│   └── ...                # 既存ファイル（一部修正）

scripts/
├── build-terminal-ui.mjs  # 既存
└── build-xterm-bundle.mjs # 新規: xterm.js バンドル
```

### API エンドポイント

| エンドポイント | 説明 |
|---------------|------|
| `GET /ttyd-mux/<session>/` | ネイティブターミナル HTML |
| `WS /ttyd-mux/<session>/ws` | ターミナル WebSocket |
| `GET /ttyd-mux/xterm-bundle.js` | xterm.js バンドル |
| `GET /ttyd-mux/terminal-client.js` | ターミナルクライアント |

### TerminalSession 実装例

```typescript
export class TerminalSession {
  private proc: Subprocess<"pipe", "pipe", "inherit">;
  private clients: Set<ServerWebSocket>;
  private outputBuffer: string[] = [];

  constructor(options: TerminalSessionOptions) {
    this.clients = new Set();
    this.proc = Bun.spawn(options.command, {
      cwd: options.cwd,
      env: options.env,
      terminal: {
        cols: options.cols ?? 80,
        rows: options.rows ?? 24,
        data: (terminal, data) => this.handleOutput(data),
      },
    });
  }

  private handleOutput(data: Buffer): void {
    const base64 = data.toString('base64');
    this.outputBuffer.push(base64);
    if (this.outputBuffer.length > this.maxBuffer) {
      this.outputBuffer.shift();
    }
    this.broadcast({ type: 'output', data: base64 });
  }

  write(data: string): void {
    this.proc.terminal?.write(data);
  }

  resize(cols: number, rows: number): void {
    this.proc.terminal?.resize(cols, rows);
  }

  private broadcast(message: ServerMessage): void {
    const json = JSON.stringify(message);
    for (const ws of this.clients) {
      ws.send(json);
    }
  }

  addClient(ws: ServerWebSocket): void {
    this.clients.add(ws);
  }

  removeClient(ws: ServerWebSocket): void {
    this.clients.delete(ws);
  }
}
```

## Notes

- Bun v1.3.5 以上が必要
- POSIX 環境（Linux, macOS）のみ対応
- 将来的に AI 機能を追加する基盤として設計

## References

- [Bun.spawn Terminal API](https://bun.com/docs/runtime/child-process)
- [Bun v1.3.5 Release Notes](https://bun.com/blog/bun-v1.3.5)
- [xterm.js](https://xtermjs.org/)
- [ttyd WebSocket Protocol](https://moebuta.org/posts/porting-ttyd-to-golang-part-ii/)
