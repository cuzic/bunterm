# CLAUDE.md

このファイルは Claude Code (claude.ai/code) がこのリポジトリで作業する際のガイダンスを提供します。

## プロジェクト概要

**bunterm** は、ブラウザからアクセス可能なターミナルを提供する CLI ツールです。

主な機能:
- カレントディレクトリで `bunterm up` するだけでブラウザアクセス可能なターミナルを起動
- デーモンがポータルページと WebSocket サーバーを提供
- tmux 連携（オプション、tmux なしでも動作可能）
- Bun.Terminal を使用したネイティブターミナル

## 技術スタック

- **ランタイム**: Bun (1.3.5+)
- **言語**: TypeScript (strict mode)
- **テスト**: Bun test
- **リンター**: Biome
- **依存**: commander, yaml

## ディレクトリ構造

```
src/
├── index.ts              # CLI エントリポイント (Commander)
├── version.ts            # バージョン情報（自動生成）
├── core/                 # コアシステム
│   ├── cli/              # CLI
│   │   └── commands/     # CLI コマンド
│   ├── config/           # 設定
│   │   ├── types.ts      # 型定義
│   │   ├── config.ts     # config.yaml 読み込み
│   │   ├── config-manager.ts # 設定マネージャ
│   │   ├── state.ts      # state.json 読み書き
│   │   └── state-store.ts # StateStore インターフェース（DI用）
│   ├── client/           # CLI→デーモン通信
│   │   ├── index.ts      # クライアント re-exports
│   │   ├── api-client.ts # HTTP API クライアント
│   │   └── daemon-client.ts # デーモンソケット通信
│   ├── daemon/           # デーモンエントリ
│   │   └── index.ts      # デーモン起動ロジック
│   ├── protocol/         # 通信プロトコル
│   │   ├── messages.ts   # WS メッセージ型
│   │   ├── blocks.ts     # Block 関連型
│   │   ├── ai.ts         # AI 関連型
│   │   ├── helpers.ts    # パース/シリアライズ
│   │   └── index.ts      # 全 re-export
│   ├── server/           # サーバー基盤
│   │   ├── server.ts     # Bun.serve サーバー
│   │   ├── http-handler.ts
│   │   ├── ws-handler.ts
│   │   ├── session-manager.ts
│   │   ├── html-template.ts # HTML テンプレート生成
│   │   ├── portal.ts
│   │   ├── pwa.ts
│   │   ├── terminal-ui/  # ターミナルUI テンプレート
│   │   └── ws/           # WebSocket ユーティリティ
│   └── terminal/         # ターミナルコア
│       ├── session.ts    # PTY セッション管理
│       ├── broadcaster.ts # クライアントブロードキャスト
│       ├── osc633-parser.ts # OSC 633 パーサー
│       ├── command-executor-manager.ts
│       ├── ephemeral-executor.ts
│       ├── persistent-executor.ts
│       └── shell-integration/ # シェル統合スクリプト
├── features/             # 機能モジュール
│   ├── ai/               # AI 統合
│   │   └── server/       # AI ランナー、API、quotes
│   ├── blocks/           # Block UI (Warp スタイル)
│   │   └── server/       # BlockModel、BlockStore
│   ├── claude-watcher/   # Claude Code 監視
│   │   └── server/
│   ├── file-watcher/     # ファイル監視
│   │   ├── server/
│   │   └── client/
│   ├── file-transfer/    # ファイル転送
│   │   ├── server/       # directory-browser 含む
│   │   └── client/
│   ├── notifications/    # プッシュ通知
│   │   ├── server/
│   │   └── client/
│   ├── preview/          # HTML プレビュー
│   │   └── client/
│   └── share/            # 読み取り専用共有
│       └── server/
├── browser/              # ブラウザ共通
│   ├── terminal/         # xterm.js 関連
│   │   ├── terminal-client.ts # WebSocket クライアント
│   │   ├── xterm-bundle.ts
│   │   ├── BlockManager.ts
│   │   └── app/          # React AI チャット
│   ├── toolbar/          # ツールバー UI
│   │   ├── index.ts
│   │   ├── FontSizeManager.ts
│   │   └── ...
│   └── shared/           # 共通ユーティリティ
│       ├── lifecycle.ts
│       ├── key-router.ts
│       └── events.ts
├── caddy/                # Caddy 連携
├── deploy/               # デプロイ
└── utils/                # 共通ユーティリティ
```

**パスエイリアス**: `@/` で `src/` ディレクトリを参照可能（例: `import { loadConfig } from "@/core/config/config.js"`）

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

`bunterm up` などのコマンド実行時、デーモンが起動していなければ自動的にバックグラウンドで起動します（tmux と同様の動作）。

```typescript
// core/client/index.ts
await ensureDaemon();  // デーモンが未起動なら起動
```

### CLI ↔ デーモン通信

- Unix socket (`~/.local/state/bunterm/bunterm.sock`) で生存確認
- HTTP API でセッション操作

### ネイティブターミナル

Bun.Terminal API を使用した組み込み PTY 実装:
- 外部依存なし（Bun のみ）
- JSON ベースの WebSocket プロトコル
- xterm.js によるブラウザ側ターミナル描画
- **依存**: Bun 1.3.5 以上が必須（POSIX のみ、Windows 非対応）

### ファイル分離

- `~/.config/bunterm/config.yaml` - 設定（事前定義セッション等）
- `~/.local/state/bunterm/state.json` - 状態（実行中セッション、PID等）

## コーディング規約

- TypeScript strict mode
- ESM モジュール (`.js` 拡張子でインポート)
- Node protocol imports (`node:fs`, `node:path` 等)
- Biome でフォーマット・リント

### ブラウザアーキテクチャ (browser/)

ブラウザ側コードは `browser/` ディレクトリに集約されています。

#### ライフサイクル管理 (lifecycle.ts)

`Scope` と `Mountable` パターンにより、イベントリスナーのメモリリークを防止します。

**基本原則:**
- `addEventListener` を直接使わず、`on()` ユーティリティを使用
- mitt の `on` も `onBus()` ユーティリティ経由で使用
- すべてのリスナーは `Scope` に登録して自動クリーンアップ

```typescript
// browser/shared/lifecycle.ts をインポート
import { type Mountable, type Scope, on, onBus } from '@/browser/shared/lifecycle.js';

// Scope を作成
const scope = new Scope();

// DOM イベントを登録（自動クリーンアップ）
scope.add(on(document, 'click', handler));
scope.add(on(element, 'input', handler, { passive: true }));

// mitt イベントを登録（自動クリーンアップ）
scope.add(onBus(toolbarEvents, 'font:change', handler));

// コンポーネント終了時にまとめて解除
scope.close();
```

#### Mountable パターン

マネージャークラスは `Mountable` インターフェースを実装し、`mount(scope)` でイベントリスナーを登録します。

```typescript
export class MyManager implements Mountable {
  private elements: { btn: HTMLElement } | null = null;

  // DOM 要素のバインド（参照のみ保存）
  bindElements(elements: { btn: HTMLElement }): void {
    this.elements = elements;
  }

  // イベントリスナー登録（Scope に追加）
  mount(scope: Scope): void {
    if (!this.elements) return;

    scope.add(on(this.elements.btn, 'click', () => this.handleClick()));
    scope.add(on(document, 'keydown', (e) => this.handleKey(e as KeyboardEvent)));
  }
}
```

#### KeyRouter（キーボード優先度管理）

複数箇所で `Escape` キーを処理する場合、`KeyRouter` で優先度を管理します。

```typescript
import { KeyRouter, KeyPriority } from '@/browser/shared/key-router.js';

const keyRouter = new KeyRouter();
keyRouter.mount(scope);

// 優先度の高い順に処理（true を返すと下位に伝播しない）
scope.add(keyRouter.register((e) => {
  if (e.key !== 'Escape' || !modal.isVisible()) return false;
  modal.hide();
  return true;  // イベント消費
}, KeyPriority.MODAL_HIGH));
```

優先度定数:
- `CRITICAL (200)`: 最優先（画像プレビュー等）
- `MODAL_HIGH (100)`: 高優先モーダル
- `MODAL (80)`: 通常モーダル
- `PANE (60)`: ペイン
- `SEARCH (40)`: 検索バー
- `GLOBAL (0)`: グローバルショートカット

#### ToolbarApp 初期化シーケンス

`browser/toolbar/index.ts` の `ToolbarApp` が各マネージャーを初期化します：

1. **マネージャー生成**: コンストラクタで依存関係を注入
2. **DOM 要素バインド**: `bindElements()` で DOM 参照を保存
3. **マウント**: `mount(scope)` でイベントリスナーを Scope に登録
4. **KeyRouter 登録**: 各モーダルのキー処理を優先度付きで登録

```typescript
// 初期化順序
const scope = new Scope();

// 1. マネージャー生成（依存関係注入）
const shareManager = new ShareManager(config);
const snippetManager = new SnippetManager(config);

// 2. DOM バインド
shareManager.bindElements({ shareBtn, modal, ... });
snippetManager.bindElements({ snippetBtn, modal, ... });

// 3. マウント（イベント登録）
shareManager.mount(scope);
snippetManager.mount(scope);

// 4. KeyRouter 登録（優先度管理）
scope.add(keyRouter.register((e) => {
  if (e.key === 'Escape' && shareManager.isVisible()) {
    shareManager.hide();
    return true;
  }
  return false;
}, KeyPriority.MODAL));

// アプリ終了時
scope.close(); // すべてのリスナーを解除
```

#### マネージャー分類

| 種別 | 特徴 | Mountable | 例 |
|------|------|-----------|-----|
| UI マネージャー | モーダル・UI 操作 | ○ | ShareManager, SnippetManager |
| データマネージャー | localStorage 等 | × | StorageManager, FontSizeManager |
| アドオンマネージャー | xterm アドオン | × | SearchManager, LinkManager |
| ハンドラー | イベント処理専用 | ○ | TouchGestureHandler, LayoutManager |

## テスト

テストは `bun:test` を使用。各モジュールに対応するテストファイルがあります。

```bash
bun test                    # 全テスト実行
bun test --watch            # ウォッチモード
bun test src/core/config/   # 特定ディレクトリのみ
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
  base_path: string;      // "/bunterm"
  base_port: number;      // 7600
  daemon_port: number;    // 7680
  listen_addresses: string[];  // ["127.0.0.1", "::1"]
  listen_sockets: string[];    // Unix ソケットパス（オプション）
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
  path: string;
  dir: string;
  started_at: string;
}
```

## 機能

### ターミナルUI
- ツールバーによる入力支援:
  - モバイル: 日本語 IME 入力、タッチピンチズーム、ダブルタップ Enter、最小化モード
  - PC: Ctrl+スクロール / トラックパッドピンチでフォントサイズ変更、Ctrl+J でトグル
  - Ctrl+Shift+F でスクロールバック検索
  - 初回利用時のオンボーディングヒント
- プッシュ通知（ターミナルベル `\a` で通知）
- 読み取り専用共有リンク（`bunterm share`）
- Unix ソケット経由のリバースプロキシ対応 (`listen_sockets`)
- terminal-ui.js は静的ファイルとして配信（ETag キャッシュ対応）

### Block UI (Warp スタイル)
- OSC 633 シェル統合によるコマンドブロック表示
- AI 統合: コマンド実行、リスク評価、出力解析
- Claude セッション監視: JSON パース、ターン検出

## 診断コマンド

`bunterm doctor` で依存関係と設定の問題を診断できます:

- Bun バージョン確認 (1.3.5+ 必須)
- 設定ファイルの検証
- デーモンの状態確認
- ポートの空き状況確認

## tmux 連携（オプション）

tmux はオプション機能です。デフォルトでは tmux なしで動作します。

### tmux_mode 設定

`config.yaml` で `tmux_mode` を設定できます:

| モード | 説明 |
|--------|------|
| `none` | tmux を使用しない（デフォルト） |
| `auto` | 既存の tmux セッションがあればアタッチ、なければ新規作成 |
| `attach` | 既存の tmux セッションにアタッチのみ |
| `new` | 常に新規 tmux セッションを作成 |

```yaml
# config.yaml
tmux_mode: auto  # tmux を使用する場合
```

**注意**: `bunterm attach` コマンドは tmux が必要です。tmux がインストールされていない場合はエラーメッセージが表示されます。

## 注意事項

- **Bun 1.3.5 以上**が必須です
  - `bun upgrade` でアップグレード可能
- POSIX のみ対応（Windows 非対応）
- tmux はオプション（`bunterm attach` コマンドのみ必要）
- `bunterm doctor` で問題を診断できます
