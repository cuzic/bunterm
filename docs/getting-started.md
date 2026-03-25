# bunterm はじめに

ブラウザからアクセス可能なターミナルを提供する CLI ツールです。カレントディレクトリで `bunterm up` するだけで、PC やスマホのブラウザからターミナルを操作できます。

## 前提条件

- **Bun 1.3.5 以上** (`bun upgrade` でアップグレード可能)
- **POSIX 環境** (Linux / macOS) — Windows は非対応
- tmux は**オプション**（なくても動作します）

## インストール

```bash
git clone <repository-url>
cd bunterm
bun install
```

## クイックスタート

```bash
# 任意のディレクトリで起動
cd ~/my-project
bunterm up

# ブラウザでアクセス（URLはターミナルに表示されます）
# 例: http://127.0.0.1:7680/bunterm/my-project

# セッションを停止
bunterm down
```

`bunterm up` を実行すると、デーモンが自動的にバックグラウンドで起動し、ブラウザからアクセス可能なターミナルセッションが作成されます。

## 主要コマンド

| コマンド | 説明 |
|----------|------|
| `bunterm up` | カレントディレクトリのセッションを開始 |
| `bunterm down` | カレントディレクトリのセッションを停止 |
| `bunterm status` | デーモンとセッションの状態を表示 |
| `bunterm list` | アクティブなセッション一覧 |
| `bunterm doctor` | 依存関係と設定の診断 |
| `bunterm start` | デーモンを起動（`--sessions` で事前定義セッションも開始） |
| `bunterm stop` | デーモンを停止 |
| `bunterm reload` | 設定をリロード（再起動なし） |

## モバイルアクセス

### ローカルネットワーク

同一ネットワーク内であれば、`config.yaml` で `listen_addresses` にローカル IP を追加するだけでアクセスできます。

```yaml
listen_addresses:
  - "0.0.0.0"
```

### HTTPS（外部アクセス / PWA）

モバイルで PWA（ホーム画面に追加）を利用するには HTTPS が必要です。Caddy を使って簡単に設定できます:

```bash
# config.yaml に hostname を設定
# hostname: example.com

# Caddy ルートを自動設定
bunterm caddy setup --hostname example.com

# 設定確認
bunterm caddy status
```

## 主な機能

### Block UI（Warp スタイル）

OSC 633 シェル統合により、コマンドごとにブロック表示されます。コマンドの入出力が視覚的に分離され、見やすくなります。

### プッシュ通知

ターミナルベル (`\a`) が鳴ると、ブラウザのプッシュ通知を受け取れます。長時間実行コマンドの完了通知に便利です。

```bash
# コマンド完了時に通知
long-running-command; echo -e '\a'
```

### 読み取り専用共有

ターミナルセッションを他の人に読み取り専用で共有できます:

```bash
# 共有リンクを作成（デフォルト1時間）
bunterm share create my-session

# 7日間有効な共有リンク
bunterm share create my-session -e 7d

# 共有リンクの一覧
bunterm share list
```

### ファイル転送

ブラウザからファイルのアップロード・ダウンロードが可能です。

### AI チャット統合

Claude、Codex、Gemini などの AI ランナーと統合し、ターミナル内でコマンド支援を受けられます。

### Claude Code 監視

Claude Code セッションの進捗をブラウザの `/agents/` ページで確認できます。

## トラブルシューティング

問題が発生した場合は、まず `bunterm doctor` を実行してください:

```bash
bunterm doctor
```

Bun のバージョン、設定ファイル、デーモンの状態、ポートの空き状況を一括チェックします。
