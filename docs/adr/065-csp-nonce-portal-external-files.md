# ADR 065: CSP nonce 方式 + Portal 静的ファイル外部化

## ステータス

採用

## コンテキスト

### 問題 1: インライン JavaScript の CSP 違反

`portal.ts` の `generatePortalHtml()` が大量のインライン `<script>` と `<style>` を埋め込んでおり、Content Security Policy (CSP) の `unsafe-inline` が必要だった。XSS 攻撃時にインラインスクリプトが実行されるリスクがあった。

### 問題 2: Portal の HTML テンプレートの肥大化

CSS と JavaScript が `portal.ts` の文字列リテラル内にあり、構文ハイライトや自動補完が効かず保守が困難だった。

同様の問題が Agent Timeline ページ（ADR 064）の HTML テンプレートにもあった。

## 決定

### CSP nonce 方式

各 HTML ページ生成時に `crypto.randomBytes(16).toString('base64')` でリクエストごとのノンスを生成し、`<script nonce="...">` / `<style nonce="...">` に付与する。

CSP ヘッダー:
```
Content-Security-Policy: script-src 'nonce-{nonce}'; style-src 'nonce-{nonce}' 'unsafe-inline'
```

- `page-routes.ts` でノンスを生成し、各ページ生成関数に渡す
- `unsafe-inline` は CSS のみ許容（xterm.js が動的スタイルを使用するため）

### Portal 静的ファイル外部化 (`core/server/portal/`)

`portal.ts` のインライン CSS/JS を外部ファイルに分離：

```
core/server/portal/
├── index.ts       # CacheEntry 型、ファイル読み込み・ETag キャッシュ
├── portal.css     # ポータルページスタイル
└── portal.js      # ポータルページ JavaScript
```

- `static-routes.ts` で `/bunterm/portal.css`, `/bunterm/portal.js` を配信
- ETag キャッシュ（MD5 ハッシュ）で効率的な配信
- 起動時に `readFileSync` で読み込み（ランタイムファイル I/O なし）
- 同パターンで Agent Timeline の CSS/JS も外部ファイル化

### パスユーティリティ (`http/path-utils.ts`)

セッション名抽出ロジックを `page-routes.ts` から抽出し、再利用可能なユーティリティとして分離。シンボリックリンクエスケープ防止のパス検証も含む。

## 代替案

### CSP hash 方式

スクリプト/スタイルの SHA-256 ハッシュを CSP ヘッダーに記載。

**採用しなかった理由**:
- コンテンツ変更のたびにハッシュ再計算が必要
- 動的に生成される部分（セッション名等）があるため hash が使えない
- nonce 方式の方が柔軟で保守しやすい

### Bun の静的ファイル配信 (`Bun.serve({ static })`)

`Bun.serve` の `static` オプションでファイルを配信。

**採用しなかった理由**:
- ETag やキャッシュヘッダーのカスタマイズが限定的
- 既存の `static-routes.ts` パターンとの一貫性を維持
- terminal-ui.js（ADR 028）と同じアプローチ

## 影響

### Positive

- XSS 発生時もインラインスクリプト実行がブロックされる
- CSS/JS が独立ファイルになり IDE サポートが有効
- ETag キャッシュでブラウザの再読み込みが効率的
- パスユーティリティの再利用で重複コード削減

### Negative

- リクエストごとのノンス生成コスト（`randomBytes(16)` は無視できるレベル）
- 静的ファイル配信のルート追加（既存パターンで対応）

## 関連

- ADR 028: Static Toolbar JS
- ADR 064: Agent Timeline View
- `src/core/server/http/routes/static-routes.ts`
