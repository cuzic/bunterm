# ADR 039: ネイティブターミナルによる ttyd プロキシアーキテクチャの廃止

## ステータス

採用

## 日付

2026-03-01

## コンテキスト

ADR 038 で Bun.Terminal ベースのネイティブターミナル実装を決定し、ttyd との並行運用期間を経て全機能の動作を確認した。本 ADR は旧 ttyd プロキシアーキテクチャの**完全廃止**を記録する。

### 旧アーキテクチャ（ttyd プロキシ）

```
Browser                    bunterm (daemon)                ttyd (external)
┌──────────────┐          ┌────────────────────┐          ┌──────────────┐
│ xterm.js     │          │ HTTP Proxy         │          │ HTTP Server  │
│ (ttyd 配信)  │◄────────►│ WebSocket Proxy    │◄────────►│ PTY          │
│              │          │ Session Router     │          │ (per session)│
└──────────────┘          └────────────────────┘          └──────────────┘
                                                          ┌──────────────┐
                                                          │ ttyd process │
                                                          │ (per session)│
                                                          └──────────────┘
```

**問題点**:

1. **プロセス管理の複雑さ**: セッションごとに ttyd プロセスを spawn し、PID を追跡する必要があった
2. **二重プロキシ**: HTTP リクエストと WebSocket 接続の両方をプロキシする必要があった
3. **外部依存**: ttyd バイナリのインストールが必要（`brew install ttyd` / `apt install ttyd`）
4. **プロトコル制約**: ttyd 独自のバイナリ WebSocket プロトコルに縛られ、拡張が困難
5. **デバッグ困難**: 3 プロセス（ブラウザ ↔ bunterm ↔ ttyd）間の通信問題の追跡が困難
6. **Bun 互換性問題**: ADR 001 で記録した通り、Bun の HTTP サーバーと `ws` ライブラリの WebSocket プロキシに互換性問題があった

### 新アーキテクチャ（ネイティブターミナル）

```
Browser                    bunterm (daemon)
┌──────────────┐          ┌──────────────────────────────────┐
│ xterm.js     │          │ Bun.serve (HTTP + WebSocket)     │
│ terminal-    │◄────────►│ TerminalSession (Bun.Terminal)   │
│ client.js    │          │ SessionManager                   │
└──────────────┘          │ Broadcaster                      │
                          └──────────────────────────────────┘
                                    │
                                    ▼ PTY (in-process)
                          ┌──────────────────┐
                          │ bash / zsh       │
                          └──────────────────┘
```

## 決定

**ttyd プロキシアーキテクチャを完全に廃止**し、以下のコンポーネントを削除する。

### 削除対象

| コンポーネント | ファイル | 理由 |
|---------------|---------|------|
| HTTP プロキシ | `http-proxy` 依存 | 不要（直接配信に移行） |
| WebSocket プロキシ | `ws` 依存 | 不要（Bun.serve の WebSocket に移行） |
| ttyd プロセス管理 | session spawn/kill | 不要（in-process PTY に移行） |
| ttyd セッションルーター | URL → ttyd ポートのルーティング | 不要（SessionManager が直接管理） |
| ttyd バイナリチェック | doctor コマンド内 | 不要（外部依存の除去） |

### 削除される依存

```diff
  "dependencies": {
-   "http-proxy": "^1.18.1",
-   "ws": "^8.16.0",
    "commander": "^12.0.0",
    "yaml": "^2.3.4"
  }
```

### 残存コンポーネント（変更なし）

- `TerminalSession`: Bun.Terminal ラッパー（ADR 038 で導入）
- `SessionManager`: セッションライフサイクル管理
- `Broadcaster`: 複数クライアントへの出力ブロードキャスト
- `terminal-client.js`: xterm.js WebSocket クライアント
- `ws-handler.ts`: Bun.serve WebSocket ハンドラ

## 影響

### Positive

- **依存削除**: `http-proxy`, `ws` ライブラリが不要に（2 依存削除）
- **外部ツール不要**: ttyd のインストールが不要（`bunterm doctor` のチェック項目も削減）
- **単一プロセス**: デーモン 1 プロセスですべてを管理。プロセス間通信なし
- **プロトコル自由度**: JSON ベースの WebSocket プロトコルで拡張が容易（Block UI、AI 統合等）
- **低レイテンシ**: プロキシ層の除去で、入出力が直接 PTY とやり取り
- **Bun 互換性問題の解消**: ADR 001 の `ws` ライブラリ問題が根本的に解消

### Negative

- **Bun 1.3.5 以上が必須**: Bun.Terminal API への依存。古い Bun では動作しない
- **POSIX 限定**: Bun.Terminal が Windows 非対応のため、Windows サポート不可
- **ZMODEM 非対応**: ttyd がサポートしていた ZMODEM ファイル転送は廃止（HTTP ファイル転送 API で代替）

### 移行の完了確認

ADR 038 で定義した移行フェーズの完了状況：

| フェーズ | 内容 | 状態 |
|---------|------|------|
| Phase 1 | ttyd と並行してネイティブセッションを作成可能に | 完了 |
| Phase 2 | 全機能の動作確認、デフォルトをネイティブに変更 | 完了 |
| Phase 3 | ttyd 依存を完全に削除 | **本 ADR で完了** |

## 関連

- ADR 001: WebSocket Proxy Implementation — ttyd プロキシの WebSocket 実装（本 ADR で廃止）
- ADR 038: Bun.Terminal ベースのネイティブターミナル実装 — ネイティブターミナルの設計
- ADR 009: Dependency Injection for Testability — テスト容易性の DI パターン
