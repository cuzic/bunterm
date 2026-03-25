# ADR 018: Doctor Command

## Status

Accepted

## Context

ttyd-mux のセットアップ時やトラブルシューティング時に、以下の確認が必要:

1. 依存ツール（ttyd, tmux, bun）がインストールされているか
2. バージョンが適切か
3. 設定ファイルが正しいか
4. デーモンが起動しているか

これらを手動で確認するのは煩雑で、初心者にとってはどこを確認すべきかわかりにくい。

## Decision

**`ttyd-mux doctor` コマンド**を実装する。

### コマンドインターフェース

```bash
$ ttyd-mux doctor
ttyd-mux doctor - System diagnostics

Checking dependencies...
  ✓ ttyd: 1.7.4
  ✓ tmux: 3.4
  ✓ bun: 1.0.0

Checking configuration...
  ✓ Config file: ~/.config/ttyd-mux/config.yaml
  ✓ Config valid

Checking daemon...
  ✓ Daemon running (pid: 12345)

All checks passed!
```

### チェック項目

| チェック | 成功条件 | 失敗時のヒント |
|---------|---------|--------------|
| ttyd | コマンドが存在し実行可能 | `brew install ttyd` / `apt install ttyd` |
| tmux | コマンドが存在し実行可能 | `brew install tmux` / `apt install tmux` |
| bun | コマンドが存在し実行可能 | `curl -fsSL https://bun.sh/install \| bash` |
| config | ファイルが存在し valid | 設定ファイルのパスを表示 |
| daemon | プロセスが起動中 | `ttyd-mux daemon` で起動 |

### 実装

```typescript
interface CheckResult {
  name: string;
  status: 'ok' | 'error' | 'warn';
  message: string;
  hint?: string;
}

async function checkTtyd(): Promise<CheckResult> {
  try {
    const version = execSync('ttyd --version', { encoding: 'utf-8' });
    return { name: 'ttyd', status: 'ok', message: version.trim() };
  } catch {
    return {
      name: 'ttyd',
      status: 'error',
      message: 'Not found',
      hint: 'Install ttyd: https://github.com/tsl0922/ttyd'
    };
  }
}
```

### 出力形式

**成功:**
```
  ✓ ttyd: 1.7.4
```

**警告:**
```
  ⚠ config: Using defaults (no config file)
```

**エラー:**
```
  ✗ ttyd: Not found
    Hint: Install ttyd: https://github.com/tsl0922/ttyd
```

### オプション

```bash
ttyd-mux doctor [options]

Options:
  -c, --config <path>  Config file path
  -h, --help           Show help
```

## Consequences

### Positive

- **セットアップ支援**: 新規ユーザーが必要なツールを把握できる
- **トラブルシューティング**: 問題の切り分けが容易
- **ヒント提供**: エラー時に解決方法を提示
- **CI/CD 統合**: スクリプトで健全性チェック可能

### Negative

- **メンテナンス**: 依存ツールの変更時に更新が必要
- **プラットフォーム差異**: インストール方法が OS によって異なる

### Neutral

- **終了コード**: すべて OK なら 0、エラーがあれば 1

## Notes

### 将来の拡張

- **ネットワークチェック**: ポートが使用可能か
- **権限チェック**: ソケットディレクトリの書き込み権限
- **バージョン互換性**: 推奨バージョンとの比較

### 類似コマンド

- `brew doctor`: Homebrew の診断
- `flutter doctor`: Flutter の環境チェック
- `npm doctor`: npm の診断

### 関連コミット

- `47a6c9d feat: add mobile scroll, auto persistence, toolbar config, and doctor command`
