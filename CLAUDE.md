# CLAUDE.md

このファイルは Claude Code (claude.ai/code) がこのリポジトリで作業する際のガイダンスを提供します。

## プロジェクト概要

**ttyd-mux** は、複数の ttyd+tmux セッションを管理する CLI ツールです。

主な機能:
- カレントディレクトリで `ttyd-mux up` するだけでブラウザアクセス可能なターミナルを起動
- デーモンがポータルページとリバースプロキシを提供
- tmux 風の自動デーモン起動

## 技術スタック

- **ランタイム**: Bun
- **言語**: TypeScript (strict mode)
- **テスト**: Bun test
- **リンター**: Biome
- **依存**: commander, yaml, http-proxy

## ディレクトリ構造

```
src/
├── index.ts              # CLI エントリポイント (Commander)
├── version.ts            # バージョン情報（自動生成）
├── config/
│   ├── types.ts          # 型定義
│   ├── config.ts         # config.yaml 読み込み
│   ├── state.ts          # state.json 読み書き
│   └── state-store.ts    # StateStore インターフェース（DI用）
├── daemon/
│   ├── index.ts          # デーモンエントリ
│   ├── server.ts         # HTTP サーバー作成
│   ├── router.ts         # リクエストルーティング + 静的ファイル配信
│   ├── api-handler.ts    # REST API ハンドラ
│   ├── http-proxy.ts     # HTTP プロキシ + ツールバー注入
│   ├── ws-proxy.ts       # WebSocket プロキシ
│   ├── portal.ts         # ポータル HTML 生成
│   ├── pwa.ts            # PWA マニフェスト、Service Worker
│   ├── terminal-ui/      # ターミナルUI モジュール
│   │   ├── index.ts      # エクスポート、inject 関数
│   │   ├── config.ts     # 設定定数
│   │   ├── styles.ts     # CSS
│   │   ├── template.ts   # HTML テンプレート
│   │   └── client/       # ブラウザ側 TypeScript（esbuild でバンドル）
│   │       ├── index.ts  # エントリポイント
│   │       ├── FontSizeManager.ts
│   │       ├── SearchManager.ts
│   │       ├── NotificationManager.ts
│   │       └── ...
│   ├── notification/     # プッシュ通知
│   │   ├── index.ts      # エクスポート
│   │   ├── types.ts      # 型定義
│   │   ├── matcher.ts    # パターンマッチング
│   │   ├── sender.ts     # Web Push 送信
│   │   └── vapid.ts      # VAPID キー管理
│   ├── share-manager.ts  # 読み取り専用共有リンク管理
│   ├── session-manager.ts # ttyd プロセス管理（DI対応）
│   ├── session-resolver.ts # セッション名解決
│   └── native-terminal/  # ネイティブターミナル（Bun.Terminal）
│       ├── index.ts      # モジュールエクスポート
│       ├── types.ts      # WebSocket プロトコル型定義
│       ├── terminal-session.ts # PTY セッション管理
│       ├── session-manager.ts  # 複数セッション管理
│       ├── ws-handler.ts # WebSocket ハンドラ
│       ├── html-template.ts # HTML テンプレート
│       └── client/       # ブラウザ側クライアント
│           ├── xterm-bundle.ts # xterm.js バンドル
│           └── terminal-client.ts # WebSocket クライアント
├── client/
│   ├── index.ts          # クライアント re-exports
│   ├── api-client.ts     # HTTP API クライアント
│   └── daemon-client.ts  # デーモンソケット通信
├── caddy/
│   ├── client.ts         # Caddy Admin API クライアント
│   ├── route-builder.ts  # ルート構築関数
│   └── types.ts          # Caddy API 型定義
├── deploy/
│   ├── static-portal.ts  # 静的ポータル HTML 生成
│   ├── caddyfile.ts      # Caddyfile スニペット生成
│   └── deploy-script.ts  # deploy.sh 生成
├── utils/
│   ├── logger.ts         # ロガー
│   ├── errors.ts         # エラーユーティリティ
│   ├── process-runner.ts # ProcessRunner インターフェース（DI用）
│   ├── socket-client.ts  # SocketClient インターフェース（DI用）
│   └── tmux-client.ts    # TmuxClient インターフェース（DI用）
├── commands/
│   ├── up.ts, down.ts    # メインコマンド
│   ├── start.ts, stop.ts, status.ts
│   ├── attach.ts
│   ├── daemon.ts, shutdown.ts
│   ├── doctor.ts         # 診断コマンド
│   ├── caddy.ts          # Caddy 連携コマンド
│   ├── share.ts          # 読み取り専用共有コマンド
│   └── deploy.ts         # デプロイコマンド（static モード用）
└── scripts/
    ├── build-terminal-ui.mjs  # ターミナルUI JS バンドル生成
    ├── build-xterm-bundle.mjs # xterm.js バンドル生成
    └── build-terminal-client.mjs # ターミナルクライアントバンドル生成
```

**パスエイリアス**: `@/` で `src/` ディレクトリを参照可能（例: `import { loadConfig } from "@/config/config.js"`）

## 開発コマンド

```bash
# 実行
bun run src/index.ts <command>

# テスト
bun test
bun test --watch           # ウォッチモード
bun run test:coverage      # カバレッジ計測

# 型チェック
bun run typecheck

# リント + フォーマット
bun run check
bun run check:fix
bun run format

# ビルド（version.ts が自動生成される）
bun run build
```

## アーキテクチャの重要ポイント

### デーモンの自動起動

`ttyd-mux up` などのコマンド実行時、デーモンが起動していなければ自動的にバックグラウンドで起動します（tmux と同様の動作）。

```typescript
// client/index.ts
await ensureDaemon();  // デーモンが未起動なら起動
```

### CLI ↔ デーモン通信

- Unix socket (`~/.local/state/ttyd-mux/ttyd-mux.sock`) で生存確認
- HTTP API でセッション操作

### ttyd の起動パラメータ

ttyd はリバースプロキシ経由でアクセスされるため、`-b` オプションでベースパスを指定:

```bash
ttyd -p 7601 -b /ttyd-mux/project-name tmux new -A -s project-name
```

### ファイル分離

- `~/.config/ttyd-mux/config.yaml` - 設定（事前定義セッション等）
- `~/.local/state/ttyd-mux/state.json` - 状態（実行中セッション、PID等）

## コーディング規約

- TypeScript strict mode
- ESM モジュール (`.js` 拡張子でインポート)
- Node protocol imports (`node:fs`, `node:path` 等)
- Biome でフォーマット・リント

## テスト

テストは `bun:test` を使用。各モジュールに対応するテストファイルがあります。

```bash
bun test                    # 全テスト実行
bun test --watch            # ウォッチモード
bun test src/config/        # 特定ディレクトリのみ
bun run test:coverage       # カバレッジ計測（現在約81%）
```

### テストパターン

- **ユニットテスト**: `*.test.ts` - 個別関数のテスト
- **Feature テスト**: `*.feature.test.ts` - 複数モジュールの統合テスト
- **DI テスト**: `*.di.test.ts` - 依存注入を使ったテスト

### Dependency Injection

テスト容易性のため、外部依存は DI パターンで抽象化されています:

- `ProcessRunner`: プロセス生成・終了
- `SocketClient`: Unix ソケット接続
- `TmuxClient`: tmux コマンド実行
- `StateStore`: 状態の読み書き

詳細は `docs/adr/009-dependency-injection-for-testability.md` を参照。

## 主要な型

```typescript
// 設定ファイル
interface Config {
  base_path: string;      // "/ttyd-mux"
  base_port: number;      // 7600
  daemon_port: number;    // 7680
  listen_addresses: string[];  // ["127.0.0.1", "::1"]
  listen_sockets: string[];    // Unix ソケットパス（オプション）
  proxy_mode: 'proxy' | 'static';  // プロキシモード
  session_backend: 'ttyd' | 'native'; // セッションバックエンド
  hostname?: string;      // Caddy 連携用ホスト名
  caddy_admin_api: string; // Caddy Admin API URL
  terminal_ui: TerminalUiConfig; // ターミナルUI設定
  notifications: NotificationConfig; // 通知設定
  native_terminal: NativeTerminalConfig; // ネイティブターミナル設定
  sessions?: SessionDefinition[];
}

// 実行中セッション
interface SessionState {
  name: string;
  pid: number;
  port: number;
  path: string;
  dir: string;
  started_at: string;
}
```

## セッションバックエンド

### ttyd モード（デフォルト）
- 外部プロセス ttyd を使用してターミナルセッションを提供
- tmux と組み合わせてセッション永続化
- バイナリ WebSocket プロトコル（ttyd 独自形式）
- **依存**: ttyd, tmux がシステムにインストール済みであること

### native モード（実験的）
- Bun.Terminal API を使用した組み込み PTY 実装
- ttyd への外部依存なし
- JSON ベースの WebSocket プロトコル
- xterm.js によるブラウザ側ターミナル描画
- **依存**: Bun 1.3.5 以上が必須（POSIX のみ、Windows 非対応）
- **設定**: `session_backend: native` と `tmux_mode: none` を config.yaml に追加

```yaml
# config.yaml
session_backend: native
native_terminal:
  scrollback: 10000
  output_buffer_size: 16384
```

詳細は `docs/adr/038-native-terminal-bun.md` を参照。

## プロキシモード

### proxy モード（デフォルト）
- 全トラフィックが ttyd-mux daemon を経由
- ツールバーによる入力支援:
  - モバイル: 日本語 IME 入力、タッチピンチズーム、ダブルタップ Enter、最小化モード
  - PC: Ctrl+スクロール / トラックパッドピンチでフォントサイズ変更、Ctrl+J でトグル
  - Ctrl+Shift+F でスクロールバック検索
  - 初回利用時のオンボーディングヒント
- プッシュ通知（ターミナルベル `\a` で通知）
- 読み取り専用共有リンク（`ttyd-mux share`）
- シンプルな Caddy 設定（単一ルート）
- Unix ソケット経由のリバースプロキシ対応 (`listen_sockets`)
- terminal-ui.js は静的ファイルとして配信（ETag キャッシュ対応）

### static モード
- Caddy から ttyd に直接ルーティング
- 低レイテンシ
- `ttyd-mux deploy` で静的ポータルを生成
- セッション変更後は `ttyd-mux caddy sync` でルート同期
- ツールバー非対応

## 診断コマンド

`ttyd-mux doctor` で依存関係と設定の問題を診断できます:

- ttyd / tmux / bun のインストール確認
- 設定ファイルの検証
- デーモンの状態確認
- ポートの空き状況確認

## 注意事項

- **ttyd モード**: ttyd と tmux がシステムにインストールされている必要があります
- **native モード**: **Bun 1.3.5 以上**が必須です（ttyd/tmux 不要、POSIX のみ）
  - `bun upgrade` でアップグレード可能
- bun 1.0 以上が必要です
- `ttyd-mux doctor` で問題を診断できます
