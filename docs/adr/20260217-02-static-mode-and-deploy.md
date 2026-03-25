# ADR 005: Static Mode and Deploy

## Status

Accepted

## Context

ttyd-mux は当初、全トラフィックをデーモン経由でプロキシする「proxy モード」のみをサポートしていた。

proxy モードの課題:
- 全リクエストがデーモンを経由するためレイテンシが増加
- WebSocket 接続もプロキシ経由となりオーバーヘッドが発生
- デーモンがボトルネックになる可能性

代替案として、Caddy から直接 ttyd にルーティングする「static モード」を検討した。

## Decision

### 1. proxy_mode 設定の追加

**決定**: `config.yaml` に `proxy_mode` 設定を追加

```yaml
proxy_mode: static  # または 'proxy'（デフォルト）
```

| モード | 動作 |
|--------|------|
| `proxy` | 全トラフィックが ttyd-mux daemon を経由 |
| `static` | Caddy から ttyd に直接ルーティング、ポータルは静的 HTML |

### 2. Deploy コマンドの追加

**決定**: `ttyd-mux deploy` コマンドで static モード用のファイルを生成

```bash
ttyd-mux deploy --output /var/www/ttyd-mux
```

生成されるファイル:
- `index.html` - 静的ポータルページ
- `Caddyfile.snippet` - Caddy 設定スニペット
- `deploy.sh` - デプロイスクリプト

### 3. Caddy Sync コマンドの追加

**決定**: `ttyd-mux caddy sync` で Caddy Admin API 経由でルートを動的更新

```bash
ttyd-mux caddy sync  # state.json のセッションを Caddy に同期
```

**動作**:
1. 現在のセッション一覧を取得
2. Caddy Admin API でルートを追加/削除
3. 不要になったルートを自動クリーンアップ

### 4. 静的ポータル HTML 生成

**決定**: `src/deploy/static-portal.ts` で静的 HTML を生成

```typescript
export function generateStaticPortal(config: Config, sessions: SessionState[]): string
```

**特徴**:
- IME ヘルパースクリプトを含む
- セッション一覧をハードコード
- JavaScript でのダイナミック更新なし

### 5. Caddy クライアントの拡張

**決定**: `src/caddy/client.ts` にセッションルート管理機能を追加

```typescript
class CaddyClient {
  async addSessionRoute(session: SessionState): Promise<void>
  async removeSessionRoute(sessionName: string): Promise<void>
  async syncSessionRoutes(sessions: SessionState[]): Promise<void>
}
```

## Consequences

### Positive

- Static モードで低レイテンシを実現
- Caddy の負荷分散機能を直接活用可能
- デーモンなしでもセッションにアクセス可能

### Negative

- Static モードではセッション追加時に `caddy sync` が必要
- IME ヘルパーは静的 HTML に埋め込まれるため、更新時は再デプロイが必要
- 2 つのモードを維持するコストが増加

### Trade-offs

| 観点 | Proxy モード | Static モード |
|------|-------------|--------------|
| レイテンシ | 高い | 低い |
| 設定の複雑さ | 低い | 高い |
| IME ヘルパー | 動的注入 | 静的埋め込み |
| セッション追加 | 自動反映 | sync 必要 |

## References

- Caddy Admin API: https://caddyserver.com/docs/api
- docs/caddy-setup.md: Caddy 設定ガイド
