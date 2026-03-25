# ADR 022: CLI Command Structure Refactoring

## Status

Accepted

## Context

CLI コマンド構造に以下の問題があった:

### 1. セッション操作コマンドの混乱

従来のコマンド構造:

```bash
ttyd-mux start <session>   # セッション開始
ttyd-mux stop <session>    # セッション停止
ttyd-mux daemon start      # デーモン開始
ttyd-mux daemon stop       # デーモン停止
```

問題点:
- `start`/`stop` がセッションとデーモン両方に存在し混乱
- tmux の `new-session` / `kill-session` との対応が不明確

### 2. デーモン関連コマンドの分散

```bash
ttyd-mux daemon     # デーモン起動（フォアグラウンド）
ttyd-mux shutdown   # デーモン停止
ttyd-mux restart    # デーモン再起動
```

問題点:
- 関連コマンドが分散
- `restart` がトップレベルにあるのは不自然

## Decision

### 1. セッションコマンドを up/down に統一

```bash
# Before
ttyd-mux start <session>
ttyd-mux stop <session>

# After
ttyd-mux up [session]    # セッション開始（セッション名省略でカレントディレクトリ名）
ttyd-mux down [session]  # セッション停止
```

**理由:**
- Docker Compose の `docker-compose up/down` と同じ直感的な命名
- デーモンの `start/stop` との混同を防止
- `up` はデーモンも自動起動するため、「立ち上げる」イメージに合致

### 2. デーモンコマンドをサブコマンド化

```bash
# Before
ttyd-mux daemon           # フォアグラウンドでデーモン起動
ttyd-mux shutdown         # デーモン停止
ttyd-mux restart          # デーモン再起動

# After
ttyd-mux daemon start     # デーモン起動（バックグラウンド）
ttyd-mux daemon stop      # デーモン停止
ttyd-mux daemon restart   # デーモン再起動
ttyd-mux daemon run       # フォアグラウンド実行（開発/デバッグ用）
ttyd-mux daemon status    # デーモン状態確認
```

**理由:**
- 関連コマンドをグループ化
- `systemctl` のような標準的なサービス管理パターン
- `run` は開発/デバッグ用途であることが明確

### 3. start/stop の後方互換性

```bash
ttyd-mux start <session>  # → up にリダイレクト（非推奨警告）
ttyd-mux stop <session>   # → down にリダイレクト（非推奨警告）
```

移行期間後に削除予定。

## Consequences

### Positive

- **直感的な命名**: `up/down` は起動・停止のイメージと一致
- **コマンドの整理**: デーモン関連が一箇所に集約
- **混同防止**: セッション操作とデーモン操作が明確に区別

### Negative

- **学習コスト**: 既存ユーザーは新しいコマンド名を覚える必要
- **後方互換性**: 古いスクリプトは更新が必要

### 新しいコマンド体系

| カテゴリ | コマンド | 説明 |
|---------|---------|------|
| セッション | `up [session]` | セッション開始 |
| セッション | `down [session]` | セッション停止 |
| セッション | `attach <session>` | ローカルターミナルでアタッチ |
| セッション | `status` | セッション一覧 |
| デーモン | `daemon start` | デーモン起動 |
| デーモン | `daemon stop` | デーモン停止 |
| デーモン | `daemon restart` | デーモン再起動 |
| デーモン | `daemon run` | フォアグラウンド実行 |
| デーモン | `daemon status` | デーモン状態 |
| 診断 | `doctor` | 環境診断 |
| Caddy | `caddy sync` | Caddy ルート同期 |
| デプロイ | `deploy` | 静的ファイル生成 |

## Notes

### 移行ガイド

```bash
# 旧コマンド → 新コマンド
ttyd-mux start my-session    → ttyd-mux up my-session
ttyd-mux stop my-session     → ttyd-mux down my-session
ttyd-mux daemon              → ttyd-mux daemon run
ttyd-mux shutdown            → ttyd-mux daemon stop
ttyd-mux restart             → ttyd-mux daemon restart
```

### 関連コミット

- `26f81ac refactor: unify session commands to up/down`
- `dc8756c refactor: restructure daemon commands as subcommands`
- `f5f715e feat: add restart command to stop and start daemon`
