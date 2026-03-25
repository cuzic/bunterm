# ADR 067: command テンプレートによる tmux_mode の置換

## ステータス

採用

## コンテキスト

bunterm は `tmux_mode` 設定（`none`/`auto`/`new`/`attach`）で tmux を特別扱いしていた。これにより：

1. **エスケープシーケンス処理が2系統に分岐** — tmux あり/なしで `allow-passthrough` 設定、OSC 52 修復、DA フィルタ条件分岐が必要
2. **概念モデルが不統一** — 「shell → bunterm → tmux → browser」と「shell → bunterm → browser」の2構成が混在し、ユーザーに分かりにくい
3. **tmux 固有コードが散在** — TmuxPaneMonitor、PaneCountChangeMessage、buildCommand() の4分岐、tmuxSessionMap 等
4. **Claude Code の OSC 9 が tmux に食われる可能性** — allow-passthrough の設定漏れで通知が届かない

## 決定

### `tmux_mode` を廃止し `command` テンプレートに統一

bunterm は「任意のコマンドの PTY をブラウザに映す」だけの責務に集中する。tmux は特別扱いせず、ユーザーが `command` に指定するコマンドの一つとして扱う。

```yaml
# tmux を使う場合
command: ["tmux", "new-session", "-A", "-s", "{{safeName}}"]
tmux_passthrough: true

# 文字列形式（シェル経由で実行）
command: "zellij attach --create {{safeName}}"

# デフォルト（省略時）— シェル直接起動
# command なし → $SHELL -i
```

### テンプレート変数

| 変数 | 値 | 用途 |
|------|----|----|
| `{{name}}` | セッション名（そのまま） | 表示、ログ |
| `{{safeName}}` | 使えない文字を `-` に置換 | tmux セッション名、ファイル名 |
| `{{dir}}` | 作業ディレクトリ | `-c` オプション |

### コマンド実行方式

- `string` — `['sh', '-c', command]` でシェル経由実行
- `string[]` — `Bun.spawn(command)` で直接実行
- `undefined` — `[$SHELL, '-i']` でデフォルトシェル

### tmux_passthrough

`tmux_passthrough: true` でセッション作成後に `tmux set-option -p allow-passthrough on` を自動実行。command の内容を自動検出するのではなく、明示的な設定にした。

### モバイル自動遷移の代替

旧: TmuxPaneMonitor がペイン数 ≥ 3 を検知 → `/agents/` に遷移
新: claude-watcher のセッション数で agent teams を検知 → `/agents/` に遷移（TODO）

## 削除されたもの

- `TmuxModeSchema` / `TmuxMode` 型
- `auto_attach` 設定
- `buildCommand()` の4分岐ロジック
- `tmuxSessionMap` / `findSessionByTmuxSession()`
- `TmuxPaneMonitor` + `PaneCountChangeMessage`
- `bunterm attach` CLI コマンド
- `--attach` / `--detach` / `--kill-tmux` オプション
- ブラウザ側 `tmuxMode` 参照

## 残したもの

- `tmux.ts` / `tmux-client.ts` ユーティリティ — ポータルの tmux セッション一覧で使用
- `GET /api/tmux/sessions` エンドポイント — ポータルから既存 tmux に attach する機能
- `tmux_passthrough` 設定 — allow-passthrough の明示的制御

## 影響

### Positive

- エスケープシーケンス処理が1パスに統一
- tmux 以外（zellij, screen 等）にも自然に対応
- bunterm のコードから tmux の知識がほぼ消失
- 設定が `command` 1フィールドに集約（4値の enum → 自由なコマンド指定）

### Negative

- `bunterm up` 一発で tmux 付きターミナルが立ち上がる手軽さがやや低下（config に command を書く必要あり）
- tmux のペイン分割をブラウザ経由で見ていたユーザーは、tmux 操作をユーザー自身が管理する必要あり

## 関連

- ADR 053: Optional tmux dependency
- ADR 066: Elysia + Eden migration
