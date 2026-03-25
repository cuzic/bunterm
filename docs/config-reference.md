# 設定リファレンス

bunterm の設定は `~/.config/bunterm/config.yaml` に記述します。すべての項目にデフォルト値があるため、設定ファイルがなくても動作します。

## 基本設定

| フィールド | 型 | デフォルト | 説明 |
|------------|------|-----------|------|
| `base_path` | string | `"/bunterm"` | URL のベースパス（`/` で始まる必要あり、末尾の `/` は自動削除） |
| `daemon_port` | number | `7680` | デーモンの HTTP ポート（1024〜65535） |
| `listen_addresses` | string[] | `["127.0.0.1", "::1"]` | リッスンする IP アドレス |
| `hostname` | string | _(なし)_ | Caddy 連携用のホスト名 |
| `caddy_admin_api` | string | `"http://localhost:2019"` | Caddy Admin API の URL |
| `daemon_manager` | `"direct"` \| `"pm2"` | `"direct"` | デーモンの管理方式 |

## command（コマンドテンプレート）

セッション開始時に実行するコマンドを指定します。省略時はデフォルトシェル (`$SHELL -i`) が起動します。

| フィールド | 型 | デフォルト | 説明 |
|------------|------|-----------|------|
| `command` | string \| string[] | _(なし)_ | 実行するコマンド |

### テンプレート変数

コマンド内で以下の変数が使えます:

| 変数 | 説明 | 例 |
|------|------|----|
| `{{name}}` | セッション名（そのまま） | `my-project` |
| `{{safeName}}` | セッション名（安全な文字に変換） | `my-project`（特殊文字は `-` に置換） |
| `{{dir}}` | 作業ディレクトリ | `/home/user/my-project` |

### コマンド実行方式

- **文字列** — `sh -c` 経由でシェル実行（パイプ等が使える）
- **配列** — `Bun.spawn()` で直接実行（シェルを介さない）
- **省略** — `$SHELL -i` でデフォルトシェルを起動

### 例

```yaml
# tmux を使う場合
command: ["tmux", "new-session", "-A", "-s", "{{safeName}}"]
tmux_passthrough: true

# zellij を使う場合
command: "zellij attach --create {{safeName}}"

# 特定のシェルを使う場合
command: ["/usr/bin/zsh", "-i"]

# 省略（デフォルトシェル）
# command を書かなければ $SHELL -i が起動
```

## tmux_passthrough

| フィールド | 型 | デフォルト | 説明 |
|------------|------|-----------|------|
| `tmux_passthrough` | boolean | `false` | セッション作成後に `tmux set-option -p allow-passthrough on` を自動実行 |

tmux 経由でセッションを実行する場合、OSC エスケープシーケンス（OSC 52 クリップボード、OSC 633 シェル統合等）を tmux を通過させるために `true` に設定してください。

## sessions（事前定義セッション）

サーバーデプロイ時など、起動時に自動的に作成するセッションを定義します。

| フィールド | 型 | 必須 | 説明 |
|------------|------|------|------|
| `name` | string | Yes | セッション名 |
| `dir` | string | Yes | 作業ディレクトリ |
| `path` | string | Yes | URL パス（`/` で始まる必要あり） |

```yaml
sessions:
  - name: web-app
    dir: /home/user/web-app
    path: /web-app
  - name: api-server
    dir: /home/user/api
    path: /api
```

事前定義セッションは `bunterm start --sessions` で一括起動できます。

## terminal_ui（ターミナル UI 設定）

| フィールド | 型 | デフォルト | 説明 |
|------------|------|-----------|------|
| `font_size_default_mobile` | number | `32` | モバイルのデフォルトフォントサイズ（8〜72） |
| `font_size_default_pc` | number | `14` | PC のデフォルトフォントサイズ（8〜72） |
| `font_size_min` | number | `10` | 最小フォントサイズ（6〜20） |
| `font_size_max` | number | `48` | 最大フォントサイズ（24〜96） |
| `double_tap_delay` | number | `300` | ダブルタップ判定時間（ミリ秒、100〜1000） |
| `reconnect_retries` | number | `3` | WebSocket 再接続リトライ回数（0〜10） |
| `reconnect_interval` | number | `2000` | 再接続間隔（ミリ秒、500〜10000） |

## notifications（通知設定）

| フィールド | 型 | デフォルト | 説明 |
|------------|------|-----------|------|
| `enabled` | boolean | `true` | 通知機能の有効/無効 |
| `contact_email` | string | _(なし)_ | VAPID 連絡先メールアドレス |
| `bell_notification` | boolean | `true` | ベル文字 (`\a`) での通知 |
| `bell_cooldown` | number | `10` | ベル通知のクールダウン（秒） |
| `patterns` | array | `[]` | パターンマッチ通知（後述） |
| `default_cooldown` | number | `300` | パターン通知のデフォルトクールダウン（秒） |

### patterns（パターン通知）

ターミナル出力が正規表現にマッチした場合に通知を送ります。

```yaml
notifications:
  patterns:
    - regex: "ERROR|FATAL"
      message: "エラーが発生しました"
      cooldown: 60
    - regex: "Build succeeded"
      message: "ビルド完了"
```

## file_transfer（ファイル転送設定）

| フィールド | 型 | デフォルト | 説明 |
|------------|------|-----------|------|
| `enabled` | boolean | `true` | ファイル転送の有効/無効 |
| `max_file_size` | number | `104857600` (100MB) | 最大ファイルサイズ（バイト） |
| `allowed_extensions` | string[] | `[]` | 許可する拡張子（空 = 全て許可） |

## preview（HTML プレビュー設定）

| フィールド | 型 | デフォルト | 説明 |
|------------|------|-----------|------|
| `enabled` | boolean | `true` | プレビュー機能の有効/無効 |
| `default_width` | number | `400` | デフォルトプレビュー幅（200〜1200） |
| `debounce_ms` | number | `300` | 更新デバウンス時間（50〜2000） |
| `auto_refresh` | boolean | `true` | 自動リフレッシュ |
| `allowed_extensions` | string[] | `[".html", ".htm", ".md", ".txt"]` | プレビュー対象の拡張子 |
| `static_serving` | object | _(後述)_ | 静的ファイル配信設定 |

### static_serving（静的ファイル配信）

| フィールド | 型 | デフォルト | 説明 |
|------------|------|-----------|------|
| `enabled` | boolean | `true` | 静的配信の有効/無効 |
| `allowed_extensions` | string[] | _(多数)_ | 配信許可する拡張子 |
| `spa_fallback` | boolean | `true` | SPA フォールバック |
| `max_file_size` | number | `52428800` (50MB) | 最大ファイルサイズ |

## directory_browser（ディレクトリブラウザ）

| フィールド | 型 | デフォルト | 説明 |
|------------|------|-----------|------|
| `enabled` | boolean | `false` | ディレクトリブラウザの有効/無効 |
| `allowed_directories` | string[] | `[]` | 閲覧許可するディレクトリ |

## native_terminal（ネイティブターミナル設定）

| フィールド | 型 | デフォルト | 説明 |
|------------|------|-----------|------|
| `enabled` | boolean | `false` | ネイティブターミナルの有効/無効 |
| `default_shell` | string | `"/bin/bash"` | デフォルトシェル |
| `scrollback` | number | `10000` | スクロールバック行数（100〜100000） |
| `output_buffer_size` | number | `1000` | 出力バッファサイズ（100〜10000） |

## ai_chat（AI チャット設定）

| フィールド | 型 | デフォルト | 説明 |
|------------|------|-----------|------|
| `enabled` | boolean | `false` | AI チャットの有効/無効 |
| `default_runner` | `"claude"` \| `"codex"` \| `"gemini"` \| `"auto"` | `"auto"` | デフォルト AI ランナー |
| `cache_enabled` | boolean | `true` | キャッシュの有効/無効 |
| `cache_ttl_ms` | number | `3600000` (1時間) | キャッシュ TTL |
| `rate_limit_enabled` | boolean | `true` | レート制限の有効/無効 |
| `rate_limit_max_requests` | number | `20` | レート制限: 最大リクエスト数（1〜100） |
| `rate_limit_window_ms` | number | `60000` (1分) | レート制限: ウィンドウ時間 |

## security（セキュリティ設定）

| フィールド | 型 | デフォルト | 説明 |
|------------|------|-----------|------|
| `dev_mode` | boolean | `false` | 開発モード（CORS 緩和等） |
| `allowed_origins` | string[] | `[]` | CORS 許可オリジン |
| `enable_ws_token_auth` | boolean | `false` | WebSocket トークン認証 |
| `ws_token_ttl_seconds` | number | `30` | WS トークンの有効期間（10〜300秒） |
| `auth_enabled` | boolean | `false` | 認証の有効/無効 |
| `auth_cookie_name` | string | `"bunterm_session"` | 認証クッキー名 |
| `auth_session_ttl_seconds` | number | `86400` (24時間) | セッション TTL |
| `auth_localhost_bypass` | boolean | `true` | localhost からのアクセスは認証バイパス |
| `auth_stealth_mode` | boolean | `false` | 未認証時に 404 を返す（存在を隠す） |
| `auth_trusted_proxies` | string[] | `[]` | 信頼するプロキシの IP |
| `auth_proxy_header` | string | `"X-Forwarded-User"` | プロキシ認証ヘッダー |
| `auth_adaptive_shield` | boolean | `false` | 適応型シールド（LAN/WAN で TTL を分ける） |
| `auth_lan_session_ttl_seconds` | number | `604800` (7日) | LAN セッション TTL |
| `auth_internet_session_ttl_seconds` | number | `3600` (1時間) | インターネットセッション TTL |

## sentry（エラー監視設定）

| フィールド | 型 | デフォルト | 説明 |
|------------|------|-----------|------|
| `enabled` | boolean | `false` | Sentry の有効/無効 |
| `dsn` | string | _(なし)_ | Sentry DSN |
| `environment` | string | `"production"` | 環境名 |
| `sample_rate` | number | `1.0` | エラーサンプリング率（0〜1） |
| `traces_sample_rate` | number | `0.1` | トレースサンプリング率（0〜1） |
| `release` | string | _(なし)_ | リリースバージョン |
| `debug` | boolean | `false` | デバッグモード |

## 設定例

### 基本（デフォルトシェル）

```yaml
# 最小設定 — これだけで動作します
daemon_port: 7680
```

### tmux 連携

```yaml
command: ["tmux", "new-session", "-A", "-s", "{{safeName}}"]
tmux_passthrough: true
```

### サーバーデプロイ（事前定義セッション）

```yaml
base_path: /bunterm
daemon_port: 7680
listen_addresses:
  - "0.0.0.0"
hostname: example.com

sessions:
  - name: web-app
    dir: /home/deploy/web-app
    path: /web-app
  - name: api
    dir: /home/deploy/api
    path: /api

security:
  auth_enabled: true
  auth_stealth_mode: true
  auth_adaptive_shield: true

notifications:
  enabled: true
  contact_email: admin@example.com
  patterns:
    - regex: "ERROR|FATAL"
      message: "サーバーエラー検知"
      cooldown: 60
```

### Docker 環境

```yaml
daemon_port: 7680
listen_addresses:
  - "0.0.0.0"
command: ["/bin/bash", "-i"]

security:
  allowed_origins:
    - "https://example.com"
```
