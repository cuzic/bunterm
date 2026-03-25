# ADR 060: WebSocket セキュリティ有効化とセッション名バリデーション

## ステータス

採用

## コンテキスト

セキュリティレビューで以下の問題が発見された：

### 問題 1: WebSocket セキュリティの無効化

`server.ts` の fetch ハンドラが `wsHandlers.upgrade()` を呼ばず `server.upgrade()` を直接実行していた。`ws-handler.ts` に実装済みの Origin バリデーション・トークン認証が完全にバイパスされており、Cross-Site WebSocket Hijacking (CSWSH) のリスクがあった。

```typescript
// Before: セキュリティ機能がバイパスされていた
const upgraded = server.upgrade(req, { data: { sessionName, authenticated: false } });
// wsHandlers.upgrade() が一度も呼ばれない
```

### 問題 2: 無制限のセッション自動作成

WebSocket 接続時、存在しないセッション名でも無条件に `createSession()` が実行されていた。セッション名のバリデーションもなく、任意のパスへの接続で PTY プロセスが生成される DoS リスクがあった。

### 問題 3: パスワードハッシュに SHA-256

シェアリンクのパスワードに高速ハッシュ（SHA-256）を使用。GPU ブルートフォースに脆弱。

## 決定

### WebSocket セキュリティの有効化

`server.ts` の WS upgrade 処理を `wsHandlers.upgrade(req, server)` に委譲する。

```typescript
// After: ws-handler.ts のセキュリティフローを経由
if (isNativeTerminalWebSocketPath(pathname, basePath)) {
  return wsHandlers.upgrade(req, server);
}
```

- `createNativeTerminalWebSocketHandlers` に `securityConfig` と `enableTokenAuth` を config から渡す
- `buildAllowedOrigins(config)` で `listen_addresses` + `daemon_port` から localhost オリジンを自動生成
- セッション自動作成は HTML ページ返却時（page-routes.ts）に移動

### セッション名バリデーション

`validateSessionName()` を `session-manager.ts` に追加：

- パターン: `/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/`
- 長さ: 1〜64 文字
- `createSession()` の先頭でバリデーション
- セッション数上限: `MAX_SESSIONS = 20`

### パスワードハッシュの移行

SHA-256 → `node:crypto` の `scryptSync` に移行（N=16384, r=8, p=1, keylen=64）。

- 新フォーマット: `scrypt:salt:hash`（プレフィックスで新旧判別）
- 既存 `salt:hash` フォーマット（SHA-256）も `verifyPassword()` で検証可能（互換性維持）
- API レスポンスから `passwordHash` を除去し、`hasPassword: boolean` フラグのみ返却

## 代替案

### セッション自動作成の完全廃止

WS 接続時もページ返却時もセッション自動作成を行わず、CLI または API での明示的作成のみ許可する。

**採用しなかった理由**:
- 「URL にアクセスすればすぐ使える」という UX が損なわれる
- page-routes.ts での自動作成に移動することでセキュリティと UX を両立

### bcrypt / argon2 の採用

**採用しなかった理由**:
- `node:crypto` の `scryptSync` は外部パッケージ不要で Bun 完全対応
- scrypt はメモリ困難関数で bcrypt と同等以上のセキュリティ
- argon2 はネイティブビルドが必要で依存が増える

## 影響

### Positive

- Origin バリデーション・トークン認証が正しく適用される
- 不正なセッション名や無制限のセッション作成が防止される
- パスワードハッシュがブルートフォース耐性を獲得

### Negative

- `wscat` 等の CLI ツールからの直接接続には `security.dev_mode: true` が必要
- 既存の Origin ヘッダーなしの接続は拒否される（`buildAllowedOrigins` で localhost は自動許可）

## 関連

- ADR 053: Optional tmux Dependency
- `src/core/server/ws/origin-validator.ts`
- `src/core/server/ws/session-token.ts`
