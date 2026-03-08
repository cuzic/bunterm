# ADR 056: PM2 Integration

## ステータス

採用

## コンテキスト

bunterm デーモンはバックグラウンドプロセスとして動作するが、以下の課題があった：

1. **クラッシュ時の復旧**: デーモンがクラッシュしても自動再起動されない
2. **システム起動時**: OS 起動時に自動起動する仕組みがない
3. **ログ管理**: stdout/stderr の永続化とローテーションが未整備
4. **監視**: プロセスの状態を確認する標準的な方法がない

## 決定

PM2 を使用してデーモンのプロセス管理を行うオプションを追加する。

### daemon_manager 設定

```yaml
# ~/.config/bunterm/config.yaml
daemon_manager: pm2  # 'builtin' | 'pm2'
```

| 値 | 説明 |
|----|------|
| `builtin` | 組み込みのバックグラウンド実行（デフォルト） |
| `pm2` | PM2 によるプロセス管理 |

### PM2 Ecosystem 設定

PM2 モード時、`~/.config/bunterm/ecosystem.config.cjs` が自動生成される。

```javascript
module.exports = {
  apps: [{
    name: 'bunterm',
    script: 'bunx',
    args: ['bunterm', 'daemon'],
    cwd: process.env.HOME,
    interpreter: 'none',
    autorestart: true,
    max_restarts: 10,
    restart_delay: 1000,
    watch: false,
    env: {
      NODE_ENV: 'production'
    }
  }]
};
```

### コマンド対応

| bunterm コマンド | PM2 モード時の動作 |
|-----------------|-------------------|
| `bunterm up` | `pm2 start ecosystem.config.cjs` |
| `bunterm down` | `pm2 stop bunterm` |
| `bunterm shutdown` | `pm2 delete bunterm` |
| `bunterm status` | `pm2 show bunterm` |
| `bunterm restart` | `pm2 restart bunterm` |

### PM2 の利点

- **自動再起動**: クラッシュ時に自動復旧
- **ログ管理**: `~/.pm2/logs/` にローテーション付きで保存
- **起動制御**: `pm2 startup` でシステム起動時に自動起動
- **監視**: `pm2 monit` でリアルタイム監視
- **クラスタリング**: 将来的な水平スケールの基盤

## 代替案

### systemd ユニットファイル

Linux 標準の systemd を使用。

**採用しなかった理由**:
- macOS では使用不可
- ユーザーごとの設定が複雑
- 開発環境向けではない

### supervisor

Python ベースのプロセス管理。

**採用しなかった理由**:
- Python 依存が増える
- Node.js エコシステムとの親和性が低い

### 組み込み watchdog

bunterm 内部でクラッシュ検知と再起動を実装。

**採用しなかった理由**:
- ログ管理、起動制御などの再実装が必要
- 既存ツールの方が信頼性が高い

## 影響

### Positive

- 本番環境での信頼性向上
- 標準的なプロセス管理フロー
- 既存の PM2 ユーザーにとって馴染み深い

### Negative

- PM2 のインストールが必要（npm install -g pm2）
- 設定の複雑性が若干増加

### Neutral

- デフォルトは `builtin` のため、既存ユーザーへの影響なし

## 関連コミット

- `6f83e63 feat(config): add daemon_manager option for pm2 integration`
- `5c005c5 feat(pm2): add ecosystem config for auto-restart`
- `31f7220 refactor(pm2): generate ecosystem config in user config directory`
- `be2ca8b fix(daemon): improve crash resilience and add file logging`
