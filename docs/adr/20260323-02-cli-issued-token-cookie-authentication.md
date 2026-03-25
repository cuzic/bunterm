# ADR 061: CLI 発行ワンタイムトークン + セッション Cookie 認証

## ステータス

採用

## コンテキスト

bunterm は HTTP API に認証がなく、WebSocket のトークン認証もデフォルト無効だった。localhost バインドに依存したセキュリティモデルは、Caddy リバースプロキシ経由やポートフォワーディングでの利用時に不十分。

### 要件

1. **「bunterm up ですぐ使える」体験の維持**: 認証がユーザー体験を損なわないこと
2. **localhost は透過的**: ローカル利用時は認証を意識させない
3. **リモートアクセスのセキュリティ**: LAN/Internet 公開時に認証が機能すること
4. **後方互換性**: `auth_enabled` デフォルト false で既存動作を維持
5. **既存基盤の活用**: `session-token.ts` の TokenGenerator を再利用

### 6つの帽子思考法による評価

20 の認証方式を評価した結果、以下の結論に至った：

- **White Hat（事実）**: 既存の HMAC トークン基盤が再利用可能。Jupyter/code-server と同系統のパターン
- **Red Hat（UX）**: 「認証している感覚がない」体験が最高。CLI 発行 URL がベスト
- **Black Hat（リスク）**: ワンタイムトークン + Cookie は致命的リスクなし。CSWSH は SameSite=Strict で防御
- **Yellow Hat（メリット）**: 実装 ~150 行で Phase 1 が完了。段階的拡張が容易
- **Green Hat（創造）**: Adaptive Shield パターンで接続元に応じた自動エスカレーションが可能

## 決定

**「CLI が門番、ブラウザは通行証（Cookie）を持つ」** モデルを採用。

### 認証フロー

```
CLI (bunterm up)
  → TokenGenerator.generate("__auth__") でワンタイムトークン生成
  → トークンを state.json に保存
  → トークン付き URL をコンソール表示

ブラウザ (GET /bunterm/session?token=xxx)
  → handleTokenExchange() でトークン検証
  → TokenGenerator.validate() でワンタイム消費（リプレイ防止）
  → InMemoryCookieSessionStore.create() でセッション作成
  → Set-Cookie: bunterm_session=<random-id> (HttpOnly, SameSite=Strict)
  → 302 リダイレクト（URL からトークン除去）

以降のリクエスト
  → authenticateRequest() で Cookie の sessionId を検証
  → WS upgrade 時も Cookie を検証（server.ts の fetch で一括ガード）
```

### 設定

```yaml
security:
  auth_enabled: false              # デフォルト無効（後方互換）
  auth_localhost_bypass: true      # localhost は認証スキップ
  auth_session_ttl_seconds: 86400  # Cookie 有効期限 24 時間
  auth_cookie_name: bunterm_session
```

### アーキテクチャ

```
src/core/server/auth/
├── cookie-session.ts      # InMemoryCookieSessionStore + Cookie ヘルパー
├── auth-middleware.ts      # authenticateRequest, handleTokenExchange, isLocalhost
├── index.ts               # Re-export
├── cookie-session.test.ts # 27 テスト
└── auth-middleware.test.ts # 21 テスト
```

#### Cookie セキュリティ

| 属性 | 値 | 理由 |
|------|---|------|
| HttpOnly | true | XSS によるトークン窃取防止 |
| SameSite | Strict | CSRF / CSWSH 防止 |
| Secure | hostname 設定時 true | HTTPS 環境での通信保護 |
| Path | basePath | スコープ制限 |
| Max-Age | auth_session_ttl_seconds | 有効期限制御 |

#### localhost 判定

`isLocalhost()` は URL ホスト名のみで判定（`127.0.0.1`, `::1`, `localhost`）。`X-Forwarded-For` ヘッダーは偽造可能なため意図的に参照しない。

### 段階的拡張計画

| Phase | 内容 | ステータス |
|-------|------|-----------|
| Phase 1 | ワンタイムトークン + Cookie（本 ADR） | **実装済み** |
| Phase 2 | OTP + Stealth Mode + NonceStore 永続化 + 接続管理 | **実装済み**（ADR 062） |
| Phase 3 | Reverse Proxy Auth + Adaptive Shield + レート制限 + 監査ログ | **実装済み**（ADR 063） |

## 代替案

### Cookie Session + Login Form

ログインフォームを bunterm に組み込む。

**採用しなかった理由**:
- 「bunterm up ですぐ使える」体験を破壊する
- ターミナル CLI ツールにログインフォームは不自然
- パスワード管理の負担が増える

### OAuth2/OIDC

外部 IdP（Google, GitHub）連携。

**採用しなかった理由**:
- 個人開発者の CLI ツールには過剰
- 外部サービス依存（オフライン利用不可）
- 実装が 500-800 行と大規模

### Passkey/WebAuthn

FIDO2 ベースのパスワードレス認証。

**採用しなかった理由**:
- 初回登録のための「別の認証手段」が必要（鶏と卵問題）
- ヘッドレスサーバーでは Passkey 登録不可
- Phase 3 で Trust Cascade パターンの一部として検討可能

### Shared Secret（環境変数のみ）

`BUNTERM_SECRET` 環境変数で認証。

**採用しなかった理由**:
- 誰がアクセスしたか追跡不可能
- シークレットのローテーション手段がない
- Cookie セッション管理がないため毎回シークレット送信が必要

## 影響

### Positive

- `auth_enabled: true` でリモートアクセスが保護される
- `auth_localhost_bypass: true` でローカル利用の体験は維持
- 既存の TokenGenerator/NonceStore を100% 再利用
- Phase 2, 3 への拡張基盤が整った

### Negative

- InMemoryCookieSessionStore はデーモン再起動でセッション消失（再度トークン URL 取得が必要）
- state.json にワンタイムトークンが平文保存（ファイルパーミッション 0600 で緩和）

## 関連

- ADR 009: Dependency Injection for Testability
- ADR 060: WebSocket Security and Session Validation
- `src/core/server/ws/session-token.ts`（TokenGenerator 基盤）
