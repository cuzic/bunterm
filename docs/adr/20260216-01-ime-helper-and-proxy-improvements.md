# ADR 002: IME Helper and Proxy Improvements

## Status

Accepted

## Context

ttyd-mux はブラウザベースのターミナルアクセスを提供するが、以下の課題があった：

1. **モバイルデバイスでの日本語入力**: スマートフォンからアクセスした場合、日本語 IME を使った入力が困難
2. **プロキシの競合問題**: `http-proxy` の `proxyRes` ハンドラーと通常のプロキシ処理が競合し、レスポンスが破損
3. **gzip 圧縮の問題**: Caddy などのリバースプロキシ経由でアクセスすると、gzip 圧縮されたレスポンスを正しく処理できない
4. **コンパイル済みバイナリの問題**: Bun でコンパイルしたバイナリでデーモンが正しく起動しない

## Decision

### 1. IME Helper の実装

**決定**: ttyd の HTML レスポンスに JavaScript/CSS を注入し、擬似的な入力フィールドを提供する

**実装詳細**:
- `src/daemon/ime-helper.ts` に IME ヘルパーのコードを実装
- `</body>` タグの前にスクリプトを注入
- WebSocket をインターセプトして ttyd との通信を確立
- ttyd プロトコル（バイナリ形式、先頭バイト `0x30` = 入力コマンド）に準拠

**UI 構成**:
```
[Ctrl] [Alt] [Esc] [Tab] [↑] [↓] [Enter] [A-] [A+] [Send] [Run]
[textarea for Japanese input]
```

**機能**:
- **修飾キー (Ctrl, Alt)**: トグル式、次の入力に適用
- **特殊キー (Esc, Tab, Enter, ↑, ↓)**: 対応するエスケープシーケンスを送信
- **Zoom (A-, A+)**: xterm.js のフォントサイズを変更して fit
- **Send**: テキストを送信
- **Run**: テキストを送信 → 1秒待機 → Enter を送信

**モバイル対応**:
- タッチフレンドリーなボタンサイズ (min-height: 40px)
- iOS ズーム防止 (font-size: 16px)
- モバイル検出で自動表示

### 2. プロキシの selfHandleResponse 統一

**決定**: すべてのプロキシリクエストで `selfHandleResponse: true` を使用する

**理由**:
- `http-proxy` の `proxyRes` イベントはすべてのプロキシリクエストで発火する
- `selfHandleResponse` を指定しない場合、http-proxy が自動でレスポンスをパイプする
- 同時に `proxyRes` ハンドラーもレスポンスを書き込もうとして競合が発生

**変更前**:
```typescript
if (isHtmlRequest && acceptsHtml) {
  proxy.web(req, res, { target, selfHandleResponse: true });
} else {
  proxy.web(req, res, { target }); // 競合発生
}
```

**変更後**:
```typescript
// Always use selfHandleResponse to avoid conflicts
proxy.web(req, res, { target, selfHandleResponse: true });
```

### 3. gzip 再圧縮の実装

**決定**: リクエストから `Accept-Encoding` を削除して非圧縮レスポンスを受け取り、レスポンス時に gzip 再圧縮する

**理由**:
- ttyd からの gzip 圧縮レスポンスを UTF-8 としてデコードすると文字化け
- IME ヘルパーを注入するには非圧縮の HTML が必要
- クライアントへのレスポンスは帯域幅削減のため再圧縮すべき

**実装**:
```typescript
// リクエスト時
(req as any).originalAcceptEncoding = req.headers['accept-encoding'];
delete req.headers['accept-encoding'];

// レスポンス時
if (supportsGzip) {
  const compressed = gzipSync(modifiedHtml);
  headers['content-encoding'] = 'gzip';
  httpRes.end(compressed);
}
```

**効果**: 734KB → 194KB (約74%削減)

### 4. コンパイル済みバイナリ対応

**問題**: Bun でコンパイルしたバイナリでは以下の問題が発生

1. `process.argv[1] === __filename` が常に true になる（バンドル内パス `/$bunfs/root/...`）
2. `process.argv[0]` が `"bun"` になる
3. `new URL('../daemon/index.js', import.meta.url)` がバンドル内パスを返す

**決定**:

1. `daemon/index.ts` の自動実行コードを削除
2. `ensureDaemon` で `process.execPath` を使用してデーモンを起動

**変更後**:
```typescript
// client/index.ts
const isBunRun = process.argv[1] === 'run' || process.argv[1]?.endsWith('.ts');
if (isBunRun) {
  // bun run src/index.ts の場合
  executable = process.argv[0] ?? 'bun';
  args = process.argv.slice(1, 3).concat(['daemon', '-f']);
} else {
  // コンパイル済みバイナリの場合
  executable = process.execPath;  // 実際のバイナリパス
  args = ['daemon', '-f'];
}
```

### 5. package.json インポート方法

**決定**: `readFileSync` ではなく直接インポートを使用

**理由**: コンパイル済みバイナリでは `__dirname` がバンドル内パスになり、package.json が見つからない

**変更**:
```typescript
// Before
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

// After
import pkg from '../package.json' with { type: 'json' };
```

## Consequences

### Positive

- モバイルデバイスから日本語入力が可能に
- プロキシ経由でのアクセスが安定
- gzip 圧縮によりネットワーク帯域を削減
- コンパイル済みバイナリが正常に動作

### Negative

- IME ヘルパーの JavaScript が ttyd の HTML に注入されるため、ttyd のアップデートで互換性問題が発生する可能性
- WebSocket インターセプトは ttyd の内部実装に依存

### Risks

- ttyd の WebSocket プロトコルが変更された場合、IME ヘルパーが動作しなくなる可能性
- xterm.js の API が変更された場合、Zoom 機能が動作しなくなる可能性

## References

- ttyd WebSocket Protocol: バイナリ形式、先頭バイト `0x30` (ASCII '0') = 入力コマンド
- xterm.js: `term.options.fontSize` でフォントサイズ変更、`fitAddon.fit()` でリサイズ
- http-proxy: `selfHandleResponse: true` で `proxyRes` イベントでのレスポンス処理を有効化
