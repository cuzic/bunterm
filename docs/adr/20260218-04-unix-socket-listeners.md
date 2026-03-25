# ADR 017: Unix Socket Listeners

## Status

Accepted

## Context

デフォルトでは ttyd-mux daemon は TCP ポート（127.0.0.1:7680）でリッスンする。

### 問題点

1. **ポート競合**: 他のアプリケーションとポートが衝突する可能性
2. **権限管理**: TCP ポートはファイルシステム権限で制御できない
3. **Nginx/Caddy 連携**: Unix ソケット経由の方が高速な場合がある
4. **セキュリティ**: TCP はネットワーク経由でアクセス可能

## Decision

**Unix ドメインソケットでのリッスンをサポート**する。

### config.yaml での設定

```yaml
# TCP ポートに加えて Unix ソケットでもリッスン
listen_sockets:
  - /run/ttyd-mux/ttyd-mux.sock
  - /tmp/ttyd-mux.sock
```

### Zod スキーマ

```typescript
export const ConfigSchema = z.object({
  // ... 既存の設定
  listen_sockets: z.array(z.string()).default([]),
});
```

### サーバー起動時の処理

```typescript
// daemon/index.ts
function startDaemon(config: Config): void {
  const server = createServer(config);

  // TCP ポートでリッスン
  for (const address of config.listen_addresses) {
    server.listen(config.daemon_port, address);
  }

  // Unix ソケットでリッスン
  for (const socketPath of config.listen_sockets) {
    // 既存のソケットファイルを削除
    if (existsSync(socketPath)) {
      unlinkSync(socketPath);
    }
    // 親ディレクトリを作成
    mkdirSync(dirname(socketPath), { recursive: true });
    server.listen(socketPath);
  }
}
```

### シャットダウン時のクリーンアップ

```typescript
function cleanupSockets(config: Config): void {
  for (const socketPath of config.listen_sockets) {
    if (existsSync(socketPath)) {
      unlinkSync(socketPath);
    }
  }
}
```

## Consequences

### Positive

- **柔軟性**: TCP とソケットを併用可能
- **パフォーマンス**: ローカル通信はソケットの方が高速
- **権限管理**: ファイルシステムのパーミッションで制御可能
- **ポート節約**: TCP ポートを使わない運用が可能

### Negative

- **プラットフォーム依存**: Windows では Unix ソケットが使えない
- **クリーンアップ必要**: 異常終了時にソケットファイルが残る可能性

### Neutral

- **Caddy 連携**: `unix/` プレフィックスでソケットに接続可能

## Notes

### Caddy での設定例

```caddyfile
example.com {
    reverse_proxy unix//run/ttyd-mux/ttyd-mux.sock
}
```

### Nginx での設定例

```nginx
upstream ttyd-mux {
    server unix:/run/ttyd-mux/ttyd-mux.sock;
}

server {
    location /ttyd-mux/ {
        proxy_pass http://ttyd-mux;
    }
}
```

### 権限設定

```bash
# ソケットディレクトリの権限
sudo mkdir -p /run/ttyd-mux
sudo chown $USER:$USER /run/ttyd-mux
sudo chmod 750 /run/ttyd-mux
```

### 異常終了時のリカバリ

```bash
# 残ったソケットファイルを手動で削除
rm /run/ttyd-mux/ttyd-mux.sock
```

### 関連コミット

- `47a6c9d feat: add mobile scroll, auto persistence, toolbar config, and doctor command`

### 関連 ADR

- ADR 005: Static Mode and Deploy - Caddy 連携
