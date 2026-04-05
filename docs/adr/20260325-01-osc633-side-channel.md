# ADR: OSC 633 サイドチャネル方式

## ステータス

提案

## コンテキスト

bunterm の Block UI は OSC 633 エスケープシーケンスに依存している。shell-integration スクリプト（bash.sh / zsh.sh）がシェルフックで OSC 633 をターミナル stdout に出力し、bunterm の osc633-parser がパースする。

tmux 経由でシェルを実行する場合、OSC 633 が tmux を通過する必要がある：

```
Shell (printf OSC 633) → PTY → tmux server → tmux client → PTY → bunterm (osc633-parser)
```

これには `tmux set-option allow-passthrough on` が必要で、以下の問題がある：

1. **設定漏れ**: ユーザーが tmux.conf に設定を忘れると Block UI が動作しない
2. **タイミング**: bunterm が `set-option -p` を実行する前にシーケンスが失われる可能性
3. **tmux バージョン依存**: `allow-passthrough` は tmux 3.3a 以降のみ対応
4. **他のマルチプレクサ**: zellij, screen 等では別の設定が必要

## 決定

shell-integration スクリプトから bunterm デーモンに **Unix ソケット HTTP API 経由で直接 OSC 633 データを送信する**サイドチャネルを追加する。

### アーキテクチャ

```
[従来] Shell → stdout → tmux (passthrough必要) → bunterm osc633-parser
[追加] Shell → osc633-sender → HTTP POST → bunterm /api/osc633
```

両方を並行して動作させる。サイドチャネルが利用可能ならそちらを優先し、従来の stdout パースもフォールバックとして残す。

### コンポーネント

#### 1. osc633-sender バイナリ

`src/tools/osc633-sender.ts` を `bun build --compile` で単体バイナリ化。

```typescript
// 使い方: osc633-sender <session> <type> [data]
// 例:     osc633-sender my-session A
//         osc633-sender my-session D 0
//         osc633-sender my-session E "ls -la"
//         osc633-sender my-session P "Cwd=/home/user"
```

- 既存の API ソケット（`~/.local/state/bunterm/bunterm-api.sock`）に HTTP POST
- 起動 → 送信 → 終了の最小実装（数十行）
- 送信失敗時はサイレントに exit（シェル操作をブロックしない）

#### 2. POST /api/osc633 エンドポイント

Elysia ルートとして追加。

```
POST /api/osc633
Content-Type: application/json

{
  "session": "my-session",
  "type": "D",
  "data": "0"
}
```

- リクエストを `OSC633Sequence` に変換
- 対象セッションの `handleOSC633Sequence()` を呼び出す
- セッションが見つからない場合は 404

#### 3. shell-integration スクリプト修正

```bash
__bunterm_osc_633() {
    # 従来の stdout 出力（xterm.js / passthrough 経由のフォールバック）
    printf '\033]633;%s\007' "$1"
    # サイドチャネル送信（バックグラウンド、失敗時サイレント）
    if [ -n "$BUNTERM_OSC633_SENDER" ]; then
        "$BUNTERM_OSC633_SENDER" "$BUNTERM_SESSION" "$@" &>/dev/null &
        disown 2>/dev/null
    fi
}
```

#### 4. 環境変数

セッション起動時に以下の環境変数をシェルに渡す：

| 変数 | 値 | 説明 |
|------|-----|------|
| `BUNTERM_NATIVE` | `1` | 既存。shell-integration の有効化トリガー |
| `BUNTERM_SESSION` | セッション名 | サイドチャネルのセッション識別 |
| `BUNTERM_OSC633_SENDER` | バイナリのフルパス | osc633-sender の場所 |

`BUNTERM_OSC633_SENDER` が未設定なら従来の printf のみ動作。

### ビルド・配布

```bash
bun build --compile src/tools/osc633-sender.ts --outfile dist/osc633-sender
```

`bunterm` 本体のビルド時に一緒にコンパイル。`dist/osc633-sender` として配布。

### 重複排除

サイドチャネルと stdout パースの両方で同じシーケンスを受信する可能性がある。対策：

- サイドチャネル経由で受信済みのシーケンスにタイムスタンプ + type でマークする
- 直後（100ms 以内）に stdout パースで同じ type を検出した場合はスキップ
- シンプルな「最後に受信した type + 時刻」の比較で十分

## 代替案

### curl で HTTP POST

shell-integration から `curl --unix-socket` で直接送信。

**採用しなかった理由**:
- curl がインストールされていない環境がある（最小 Docker イメージ等）
- 毎回 curl プロセスの fork + Unix ソケット接続で osc633-sender より重い
- curl のバージョンによって `--unix-socket` 非対応

### Named Pipe (FIFO)

bunterm が FIFO を作成し、シェルから echo で書き込み。

**採用しなかった理由**:
- reader 不在時に writer がブロックする問題の対処が必要
- FIFO のライフサイクル管理（作成・削除・権限）が複雑
- HTTP API の方が既存インフラを活用できる

### socat で Unix ソケット送信

**採用しなかった理由**:
- socat は標準インストールされていないことが多い
- 追加の外部依存を避けたい

## 影響

### Positive

- tmux passthrough 設定なしで Block UI が完全動作
- zellij, screen 等の他のマルチプレクサでも動作
- 単体バイナリなので Bun のインストール不要

### Negative

- osc633-sender バイナリの配布・インストールが必要
- コマンドごとに数回のプロセス fork（A/B/C/D/E/P）

### Neutral

- 従来の stdout パースは残るため、後方互換性に影響なし
