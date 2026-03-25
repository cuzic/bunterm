# ADR 070: Caddy リバースプロキシ統合

## ステータス

採用

## コンテキスト

bunterm はブラウザからターミナルにアクセスする仕組みを提供するが、本番環境ではリバースプロキシを介した HTTPS 終端、認証、ルーティングが必要になる。初期設計の段階でリバースプロキシの選定と統合方針を決める必要があった。

### 要件

1. **HTTPS 終端**: Let's Encrypt による自動証明書管理
2. **WebSocket プロキシ**: ターミナル通信の WebSocket を透過的にプロキシ
3. **動的ルート管理**: セッション作成・削除に応じてルートをプログラム的に追加・削除
4. **認証委譲**: 認証処理をリバースプロキシ層で行い、アプリケーション層をシンプルに保つ

## 決定

### Caddy をリバースプロキシとして採用

[Caddy](https://caddyserver.com/) を bunterm のリバースプロキシとして採用する。

#### Admin API によるプログラム的ルート管理

Caddy の [Admin API](https://caddyserver.com/docs/api) を使用して、bunterm デーモンからルートを動的に管理する。

```typescript
// caddy/caddy-manager.ts
// Admin API 経由でルートを追加・削除
await fetch(`${caddyAdminApi}/config/apps/http/servers/srv0/routes`, {
  method: 'POST',
  body: JSON.stringify(routeConfig),
});
```

#### 設定ファイルでの統合

```yaml
# config.yaml
hostname: bunterm.example.com
caddy_admin_api: http://localhost:2019
```

### 認証の委譲

初期段階では認証を Caddy の basic_auth や forward_auth に委譲する。アプリケーション層では認証済みリクエストを信頼する構造とした（後に ADR 062 以降で独自認証に移行）。

## 代替案

### nginx

**採用しなかった理由**:
- 動的ルート管理に設定ファイルの書き換え + reload が必要
- API による動的操作が標準では不可能（nginx Plus は有料）
- Let's Encrypt の自動管理に certbot 等の外部ツールが必要

### Traefik

**採用しなかった理由**:
- Docker/Kubernetes 向けの設計が中心で、単独プロセスとの統合が複雑
- 設定が TOML/YAML ベースで、API による動的操作のドキュメントが Caddy ほど充実していない
- WebSocket プロキシの設定が Caddy より冗長

### リバースプロキシなし（直接公開）

**採用しなかった理由**:
- HTTPS 終端をアプリケーション内で管理する複雑さ
- セキュリティ層の分離ができない
- 本番環境での運用に不向き

## 影響

### Positive

- **自動 HTTPS**: Caddy が Let's Encrypt 証明書を自動管理
- **動的ルート管理**: Admin API でセッション追加時にルートを即時反映
- **WebSocket 透過プロキシ**: 追加設定なしで WebSocket をプロキシ
- **シンプルな設定**: Caddyfile または JSON 設定が直感的

### Negative

- **Caddy への依存**: リバースプロキシ層が Caddy 固有の API に依存
- **Admin API の可用性**: Caddy プロセスが停止するとルート管理不可
- **ローカル開発との差異**: 開発環境では Caddy なしで動作するため、プロキシ関連の問題が本番でのみ発覚する可能性

## 関連

- ADR 000: CLI-Daemon アーキテクチャ
- ADR 017: Unix Socket Listeners
