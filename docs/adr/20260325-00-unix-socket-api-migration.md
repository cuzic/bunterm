# ADR: CLI→デーモン通信を HTTP over Unix ソケットに統一

## ステータス

採用

## コンテキスト

bunterm の CLI→デーモン通信は2系統のメカニズムが並存していた:

1. **TCP HTTP API** (`http://localhost:7680`) — Elysia ベースの REST API。セッション管理、ファイル操作、AI 等の機能エンドポイント
2. **Raw text Unix ソケット** (`~/.local/state/bunterm/bunterm.sock`) — `node:net` の `createServer` による独自プロトコル。`ping`/`shutdown`/`reload` の3コマンドのみ

### 問題点

1. **ポート競合リスク**: TCP ポート 7680 は他プロセスと競合する可能性がある
2. **二重プロトコル**: 同じデーモンに対して2種類の通信方式が存在し、保守コストが増加
3. **型安全性の欠如**: Raw text プロトコルは文字列ベースで、Elysia/Eden の型安全性の恩恵を受けられない
4. **ソケットファイルの競合**: 2つのソケットファイル（CLI用とAPI用）の管理が必要

## 決定

### HTTP over Unix ソケットへの一本化

Raw text Unix ソケットを廃止し、すべての CLI→デーモン通信を HTTP API 経由に統一する。HTTP API は TCP と Unix ソケットの両方でリッスンする（dual-listen）。

| コンポーネント | Before | After |
|----------------|--------|-------|
| CLI→デーモン ping | Raw socket `ping` → `pong` | `GET /api/ping` over Unix socket |
| CLI→デーモン shutdown | Raw socket `shutdown` → `ok` | `POST /api/shutdown` over Unix socket |
| CLI→デーモン reload | Raw socket `reload` → JSON | `POST /api/reload` over Unix socket |
| ブラウザ→デーモン | TCP HTTP + WebSocket | TCP HTTP + WebSocket（変更なし）|
| ソケットファイル | 2つ（CLI用 + API用） | 1つ（API用のみ）|

### 実装

#### Phase 1: サーバー dual-listen
- `server.ts` に `Bun.serve({ unix, fetch: app.fetch })` を追加
- TCP（ブラウザ用）と Unix ソケット（CLI用）の両方で同じ Elysia アプリを配信

#### Phase 2: クライアント Unix ソケット経由
- `daemon-url.ts` に `getDaemonConnection()` を追加
- Eden クライアントが Unix ソケット経由で API を呼び出し
- TCP フォールバック付き

#### Phase 3: daemon コマンドソケット統合
- `system.ts` Elysia プラグインを新規作成（`/api/ping`, `/api/shutdown`, `/api/reload`）
- `daemon/index.ts` から `createUnixServer` ブロックを削除
- `daemon-probe.ts` を HTTP fetch ベースに書き換え
- `daemon-client.ts` の `shutdownDaemon` を HTTP fetch ベースに書き換え

#### Phase 4: テスト更新
- DI テストを `fetch` モックベースに移行
- shutdown コマンドテストを更新

## 結果

### メリット

- **単一プロトコル**: すべての通信が HTTP/JSON で統一され、保守性が向上
- **型安全性**: Elysia + Eden による End-to-End 型安全な通信
- **セキュリティ**: Unix ソケットはファイルシステム権限で保護され、ネットワーク攻撃面を削減
- **パフォーマンス**: Unix ソケットは TCP より低レイテンシ
- **簡素化**: ソケットファイルが1つに統合

### デメリット

- **Bun 依存**: `fetch({ unix })` は Bun の拡張 API。Node.js への移植性が低下
- **テスト複雑性**: `fetch` のモックが raw socket のモックより若干複雑

### 削除されたコード

- `daemon/index.ts`: `createUnixServer` ブロック（約40行）、`cleanupSocketFile` ヘルパー
- `daemon-probe.ts`: raw socket `connect`/`write`/`data` パターン
- `daemon-client.ts`: raw socket `shutdownDaemon` 実装
