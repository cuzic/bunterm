# ADR 063: 認証 Phase 3 — Reverse Proxy Auth・Adaptive Shield・レート制限・監査ログ

## ステータス

採用

## コンテキスト

ADR 061（Phase 1）+ ADR 062（Phase 2）で CLI 発行トークンと OTP による認証基盤を整えたが、以下の課題が残っていた：

1. **リバースプロキシ認証なし**: Caddy/nginx/Authelia 等の前段認証を信頼できない
2. **ネットワークゾーン非考慮**: localhost/LAN/Internet で一律の TTL・ポリシー
3. **レート制限なし**: API エンドポイントへのブルートフォース・DoS が制限されない
4. **監査証跡なし**: 誰が・いつ・どこから接続したかの記録がない

## 決定

### Reverse Proxy Auth (`auth/proxy-auth.ts`)

信頼されたリバースプロキシからの `X-Forwarded-User`（設定変更可能）ヘッダーを認証情報として受け入れる。

```yaml
security:
  auth_trusted_proxies: ["192.168.1.1", "10.0.0.0/8"]
  auth_proxy_header: "X-Forwarded-User"
```

- 接続元 IP が `auth_trusted_proxies`（IP / CIDR）に一致する場合のみヘッダーを信頼
- CIDR マッチングは IPv4 ビット演算で実装
- ヘッダー偽造防止: 信頼されていない IP からのヘッダーは無視

### Adaptive Shield / Network Classifier (`auth/network-classifier.ts`)

接続元 IP をネットワークゾーンに分類し、ゾーンごとにセッション TTL を自動調整。

| ゾーン | 判定 | デフォルト TTL |
|--------|------|---------------|
| `localhost` | `127.0.0.0/8`, `::1` | `auth_session_ttl_seconds`（24h） |
| `lan` | RFC 1918, RFC 4193, リンクローカル | `auth_lan_session_ttl_seconds`（7d） |
| `internet` | 上記以外 | `auth_internet_session_ttl_seconds`（1h） |

```yaml
security:
  auth_adaptive_shield: true
  auth_lan_session_ttl_seconds: 604800      # 7 days
  auth_internet_session_ttl_seconds: 3600   # 1 hour
```

- IPv4: `parseIPv4()` でオクテット分解 → RFC 1918 / loopback / link-local 判定
- IPv6: `::1`（loopback）、`fe80::` / `fc00::` / `fd00::`（private/link-local）判定
- IPv4-mapped IPv6（`::ffff:x.x.x.x`）対応

### IP ベースレート制限 (`auth/rate-limiter.ts`)

スライディングウィンドウ方式の IP ベースレート制限を API エンドポイントに適用。

| カテゴリ | 上限 | 対象 |
|----------|------|------|
| セッション作成 | 5 req/min | `POST /api/sessions` |
| ファイルアップロード | 20 req/min | `POST /api/files/upload` |
| AI エンドポイント | 10 req/min | `POST /api/ai/*` |
| GET（一般） | 60 req/min | 全 GET |
| 変更操作（一般） | 30 req/min | 全 POST/PUT/DELETE |

- `SlidingWindowRateLimiter` クラス: タイムスタンプ配列でウィンドウ内リクエストを管理
- 5 分間隔で期限切れエントリをクリーンアップ
- 429 Too Many Requests + `Retry-After: 60` ヘッダー返却
- `server.ts` の fetch ハンドラで一括ガード

### 監査ログ (`auth/audit-logger.ts`)

認証・セッションイベントを JSON Lines 形式でファイルに記録。

- イベント種別: `auth_success`, `auth_failure`, `session_create`, `session_end`, `otp_attempt`, `ws_connect`, `ws_disconnect`
- フィールド: `timestamp`, `type`, `remoteAddr`, `sessionName`, `user`, `details`
- ファイルパーミッション: 0600
- 起動時にディレクトリとファイルを自動作成

## 代替案

### リバースプロキシ認証に JWT 検証

プロキシが発行した JWT を bunterm 側で検証。

**採用しなかった理由**:
- JWT 署名鍵の共有・ローテーション管理が煩雑
- Authelia/Caddy Security 等は `X-Forwarded-User` が標準
- ヘッダーベースの方がシンプルで十分安全（信頼 IP 制限あり）

### レート制限に外部ミドルウェア（express-rate-limit 等）

**採用しなかった理由**:
- Bun.serve のネイティブ fetch ハンドラに直接組み込む設計
- Express ミドルウェアは使用不可
- 50 行程度の実装で外部依存不要

### 監査ログに structured logging ライブラリ

Pino/Winston 等の既存ロガーを流用。

**採用しなかった理由**:
- 監査ログはアプリケーションログとは分離すべき（保持ポリシーが異なる）
- JSON Lines 形式で `jq` などで簡単に解析可能
- 専用ファイルにより誤削除リスクを低減

## 影響

### Positive

- Caddy/nginx/Authelia 等のリバースプロキシ環境で SSO が実現
- LAN 接続は長 TTL、Internet は短 TTL で UX とセキュリティを両立
- ブルートフォースと DoS が IP ベースで制限される
- 「誰が・いつ・どこから」の監査証跡が残る

### Negative

- レート制限はインメモリのため、デーモン再起動でカウンタがリセットされる（許容可能）
- 監査ログファイルの自動ローテーション未実装（将来課題）
- `auth_trusted_proxies` の設定ミスでヘッダー偽造が可能（設定ドキュメントで注意喚起）

## 関連

- ADR 061: CLI 発行ワンタイムトークン + Cookie 認証（Phase 1）
- ADR 062: 認証 Phase 2 — OTP・Stealth Mode・NonceStore 永続化
- ADR 060: WebSocket セキュリティ有効化とセッション名バリデーション
