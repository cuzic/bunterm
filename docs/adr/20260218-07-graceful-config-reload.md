# ADR 020: Graceful Config Reload

## Status

Accepted

## Context

デーモン起動後に設定を変更したい場合、以下の問題があった:

1. **再起動が必要**: 設定変更のたびに `ttyd-mux shutdown && ttyd-mux daemon` が必要
2. **セッション中断**: 再起動時に WebSocket 接続が切断される
3. **ダウンタイム**: 数秒間サービスが利用不可になる

特に toolbar 設定（フォントサイズなど）のような軽微な変更でも再起動が必要だった。

## Decision

### 1. ConfigManager シングルトン

設定を動的に管理する ConfigManager クラスを導入:

```typescript
class ConfigManager {
  private config: Config;
  private configPath?: string;

  constructor(configPath?: string) {
    this.configPath = configPath;
    this.config = loadConfig(configPath);
  }

  getConfig(): Config {
    return this.config;
  }

  reload(): ReloadResult {
    // 設定ファイルを再読み込みし、変更を検出
  }
}
```

### 2. ホットリロード vs コールドリロード

設定項目を2種類に分類:

| 種類 | 項目 | 理由 |
|------|------|------|
| **ホットリロード** | `toolbar.*`, `sessions`, `proxy_mode` | リクエストごとに参照 |
| **コールドリロード** | `daemon_port`, `base_path`, `listen_addresses`, `listen_sockets` | サーバー起動時に固定 |

```typescript
const HOT_RELOADABLE = [
  'toolbar',
  'sessions',
  'proxy_mode',
  'caddy_admin_api',
  'hostname'
];

const REQUIRES_RESTART = [
  'daemon_port',
  'base_path',
  'listen_addresses',
  'listen_sockets'
];
```

### 3. 動的設定参照

サーバーは毎リクエスト時に最新の設定を取得:

```typescript
// server.ts
let getConfigFunc: (() => Config) | null = null;

export function setConfigGetter(getter: () => Config): void {
  getConfigFunc = getter;
}

export function createDaemonServer(initialConfig: Config): Server {
  const server = createServer((req, res) => {
    // 動的設定を取得（ConfigManager 未初期化時は initialConfig にフォールバック）
    const config = getConfigFunc ? getConfigFunc() : initialConfig;
    handleRequest(config, req, res);
  });
  // ...
}
```

### 4. reload コマンド

```bash
# 設定ファイルを編集後
ttyd-mux reload

# 出力例
Reloaded settings:
  - toolbar.font_size_default_mobile
  - toolbar.font_size_default_pc

Settings requiring restart:
  - daemon_port
```

### 5. Unix ソケット通信

```typescript
// daemon/index.ts - reload ハンドラ
if (command === 'reload') {
  const result = reloadConfig();
  socket.write(JSON.stringify(result));
}

// ReloadResult 型
interface ReloadResult {
  success: boolean;
  reloaded: string[];      // ホットリロードされた項目
  requiresRestart: string[]; // 再起動が必要な項目
  error?: string;
}
```

### 6. エラーハンドリング

無効な設定ファイルの場合、元の設定を保持:

```typescript
reload(): ReloadResult {
  try {
    const newConfig = loadConfig(this.configPath);
    // 変更検出と適用
    this.config = newConfig;
    return { success: true, reloaded, requiresRestart };
  } catch (err) {
    // 元の設定を維持
    return { success: false, error: err.message, reloaded: [], requiresRestart: [] };
  }
}
```

## Consequences

### Positive

- **ゼロダウンタイム**: ホットリロード可能な設定は即座に反映
- **安全**: 無効な設定でもサービス継続
- **透明性**: どの設定が再起動を要するか明示
- **テスト容易**: ConfigManager 未使用時のフォールバック動作

### Negative

- **複雑性**: 設定の参照方法が間接的に
- **一貫性**: 一部の設定は再起動が必要という非対称性

### Neutral

- **キャッシュ**: toolbar.js はブラウザキャッシュされるため、reload 後もキャッシュクリアが必要な場合あり

## Notes

### 使用例

```bash
# 1. 設定ファイルを編集
vi ~/.config/ttyd-mux/config.yaml

# 2. 変更を反映
ttyd-mux reload

# 3. 結果を確認
# ホットリロード: 即座に反映
# コールドリロード: 次回 daemon 起動時に反映
```

### テスト

```bash
bun test src/daemon/config-manager.test.ts
```

6つのテストケース:
- 初期化
- 変更なし検出
- ホットリロード可能な変更
- 再起動必要な変更
- 無効な設定のハンドリング
- 複数変更の検出

### 関連コミット

- `311d609 feat: add graceful config reload without daemon restart`

### 関連 ADR

- ADR 016: Toolbar Configuration - 設定項目の詳細
- ADR 017: Unix Socket Listeners - ソケット通信
