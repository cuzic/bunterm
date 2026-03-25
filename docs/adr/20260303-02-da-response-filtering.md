# ADR 052: Device Attributes (DA) Response Filtering

## ステータス

採用

## コンテキスト

Native Terminal モードで、ターミナル出力に `?64;1;2;4;6;15;22c` のようなゴミ文字が表示される問題が発生した。

### 原因

xterm.js がターミナルに送信する **Device Attributes (DA) 問い合わせ** に対する応答が問題の原因。

1. **プログラム側**: シェルや vim などが DA1 問い合わせ `ESC [ c` または `ESC [ 0 c` を送信
2. **xterm.js**: これを受け取り、DA1 応答 `ESC [ ? 64;1;2;... c` を PTY に送信
3. **PTY 側**: この応答を解釈できず、エスケープシーケンスがそのまま表示される

```
+----------+    ESC [ c     +----------+
| シェル   | -------------> | xterm.js |
+----------+                +----------+
                                  |
                            ESC [ ? 64;... c
                                  v
                            +----------+
                            |   PTY    | → ゴミ文字として表示
                            +----------+
```

### 問題のシーケンス

| シーケンス | 名前 | 説明 |
|-----------|------|------|
| `ESC [ c` | DA1 Request | Primary Device Attributes 問い合わせ |
| `ESC [ > c` | DA2 Request | Secondary Device Attributes 問い合わせ |
| `ESC [ ? Ps c` | DA1 Response | xterm.js からの応答 |
| `ESC [ > Ps c` | DA2 Response | xterm.js からの応答 |

## 決定

### 入力側でのフィルタリング

PTY への入力時に DA 応答シーケンスをフィルタリングする。出力側でなく入力側でフィルタする理由：

1. **出力は変更しない**: 出力フィルタリングは正当なコンテンツを誤って除去するリスクがある
2. **根本原因の対処**: DA 応答が PTY に届かないようにするのが正しい対処

```typescript
// terminal-session.ts
private filterDAResponses(data: Uint8Array): Uint8Array {
  // DA1 response: ESC [ ? Ps c
  // DA2 response: ESC [ > Ps c
  const DA1_PATTERN = /\x1b\[\?[\d;]*c/g;
  const DA2_PATTERN = /\x1b\[>[\d;]*c/g;

  let text = new TextDecoder().decode(data);
  const originalLength = text.length;

  text = text.replace(DA1_PATTERN, '');
  text = text.replace(DA2_PATTERN, '');

  if (text.length !== originalLength) {
    return new TextEncoder().encode(text);
  }
  return data;
}
```

### 適用タイミング

tmux を使用していない場合のみフィルタリングを適用：

```typescript
writeToTerminal(data: Uint8Array): void {
  if (!this.hasTmux) {
    // tmux なしの場合は DA 応答をフィルタ
    const filtered = this.filterDAResponses(data);
    this.terminal.write(filtered);
    return;
  }
  this.terminal.write(data);
}
```

**tmux 使用時に不要な理由**: tmux は自身がターミナルエミュレータとして動作し、DA 問い合わせ/応答を適切に処理する。

## 代替案

### xterm.js 側での DA 応答抑制

xterm.js のオプションや API で DA 応答を無効化する。

**採用しなかった理由**: xterm.js には DA 応答を完全に無効化するオプションがない。内部動作をハックするのはメンテナンス性が低い。

### 出力側でのフィルタリング

PTY からの出力時に DA 問い合わせをフィルタする。

**採用しなかった理由**:
- 正当な出力（例: エスケープシーケンスを含むファイルの cat）を誤ってフィルタするリスク
- 入力フィルタのほうが安全

## 影響

### Positive

- ゴミ文字の表示を解消
- ユーザー体験の向上
- tmux なしでの Native Terminal 利用が実用的に

### Negative

- DA 応答に依存するアプリケーションが正しく動作しない可能性（稀）
- フィルタリングによる微小な処理オーバーヘッド

### Risks

- DA 応答の形式が変わった場合、正規表現の更新が必要
- 将来的に DA 応答が必要なユースケースが出た場合の対応

## 関連

- ADR 049: xterm.js Mouse Tracking Reset（同様のエスケープシーケンス問題）
- ADR 038: Native Terminal with Bun

## 関連コミット

- `a8a521d fix(native-terminal): filter DA responses on input side, not output`
- `90d85dc fix(native-terminal): filter DA response sequences from output`

## 参考

- [XTerm Control Sequences - Device Status](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h3-Device-Status-Report)
- [ECMA-48: Control Functions](https://www.ecma-international.org/publications-and-standards/standards/ecma-48/)
