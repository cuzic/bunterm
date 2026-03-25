# よくある質問（FAQ）

## `bunterm up` がエラーになる

まず `bunterm doctor` を実行して原因を特定してください:

```bash
bunterm doctor
```

よくある原因:
- **Bun のバージョンが古い** — `bun upgrade` で 1.3.5 以上にアップグレード
- **ポートが使用中** — `daemon_port`（デフォルト 7680）が他のプロセスで使われている
- **設定ファイルの構文エラー** — `~/.config/bunterm/config.yaml` を確認

## モバイルで文字が小さい

以下の方法でフォントサイズを調整できます:

- **ピンチズーム** — 2本指でピンチ操作（タッチスクリーン）
- **設定で変更** — `config.yaml` の `terminal_ui.font_size_default_mobile` を調整（デフォルト: 32）

```yaml
terminal_ui:
  font_size_default_mobile: 36  # より大きくする場合
  font_size_min: 10
  font_size_max: 48
```

PC では Ctrl+スクロールまたはトラックパッドピンチでもフォントサイズを変更できます。

## Caddy で HTTPS を設定したい

1. `config.yaml` に hostname を設定:

```yaml
hostname: example.com
```

2. Caddy ルートを自動設定:

```bash
bunterm caddy setup --hostname example.com
```

3. 設定を確認:

```bash
bunterm caddy status
```

手動で Caddyfile を書きたい場合は、スニペットを出力できます:

```bash
bunterm caddy snippet
```

詳細は [docs/caddy-setup.md](caddy-setup.md) を参照してください。

## Claude Code の進捗を見たい

ブラウザで `/agents/` ページにアクセスしてください。Claude Code セッションの進捗（JSON パース、ターン検出）がリアルタイムで表示されます。

この機能は claude-watcher モジュールが自動的に Claude Code のセッションを検出して動作します。

## ターミナルを他の人に見せたい

`bunterm share` で読み取り専用の共有リンクを作成できます:

```bash
# 1時間有効な共有リンクを作成
bunterm share create my-session

# 有効期間を指定（例: 7日）
bunterm share create my-session -e 7d

# アクティブな共有リンクを確認
bunterm share list

# 共有リンクを取り消し
bunterm share revoke <token>
```

共有リンクを受け取った人は、ブラウザでターミナルの出力をリアルタイムで閲覧できます（入力はできません）。

## tmux を使いたい

`config.yaml` の `command` に tmux コマンドを指定してください:

```yaml
# tmux セッションに自動アタッチ（なければ作成）
command: ["tmux", "new-session", "-A", "-s", "{{safeName}}"]
tmux_passthrough: true
```

`tmux_passthrough: true` を設定すると、OSC エスケープシーケンス（クリップボード連携、シェル統合等）が tmux を通過するようになります。

tmux 以外のターミナルマルチプレクサ（zellij, screen 等）も同様に `command` で指定できます:

```yaml
# zellij の場合
command: "zellij attach --create {{safeName}}"

# screen の場合
command: "screen -dRR {{safeName}}"
```

テンプレート変数の詳細は [docs/config-reference.md](config-reference.md#commandコマンドテンプレート) を参照してください。

## Windows で動く？

**動きません。** bunterm は POSIX 環境（Linux / macOS）のみ対応です。

Windows で使いたい場合は WSL2（Windows Subsystem for Linux）内で実行してください。

## デーモンが停止しない

```bash
# 通常の停止
bunterm stop

# セッションも一緒に停止
bunterm stop --stop-sessions

# それでも停止しない場合、状態を確認
bunterm status --json
```

## 設定を変更したが反映されない

デーモン再起動なしで設定をリロードできます:

```bash
bunterm reload
```

コード自体を更新した場合は再起動が必要です:

```bash
bunterm restart
```

## 認証を有効にしたい

`config.yaml` の `security` セクションで認証を設定します:

```yaml
security:
  auth_enabled: true
  auth_localhost_bypass: true   # localhost は認証不要
  auth_stealth_mode: true       # 未認証時に 404 を返す
  auth_adaptive_shield: true    # LAN/WAN で TTL を自動調整
```

認証済み接続の管理:

```bash
# 接続一覧
bunterm connections list

# 接続を取り消し
bunterm connections revoke <id>
```
