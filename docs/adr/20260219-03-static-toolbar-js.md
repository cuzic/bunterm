# ADR 028: Static toolbar.js with ETag Caching

## Status

Accepted

## Context

### 問題: toolbar.js の二重管理

ADR 015 で toolbar モジュールを分離し、外部 JS として配信する方式を採用した。しかし、その実装には問題があった:

1. **コードの二重管理**: `getToolbarScript()` に 1300 行のインライン JS が残存
2. **動的生成のオーバーヘッド**: `getToolbarJs()` が毎回 config を結合
3. **キャッシュ効率が悪い**: config が変わらなくても toolbar.js 全体を再ダウンロード
4. **TypeScript 分離の無駄**: `src/daemon/toolbar/client/` に TypeScript 版があるのに使われていない

### 現状の配信方式

```typescript
// Before: 動的生成
function getToolbarJs(config): string {
  const bundle = loadBundledScript();  // dist/toolbar.bundle.js
  if (bundle) {
    return `window.__TOOLBAR_CONFIG__ = ${JSON.stringify(config)};\n${bundle}`;
  }
  return getToolbarScript(config);  // 1300行のフォールバック
}
```

## Decision

### 1. toolbar.js を完全に静的ファイル化

```
Before:
  HTML ← config なし
  toolbar.js ← config 埋め込み（動的生成）

After:
  HTML ← config 埋め込み（window.__TOOLBAR_CONFIG__）
  toolbar.js ← 完全に静的（dist/toolbar.js）
```

### 2. 削除するコード

| 関数 | 行数 | 理由 |
|------|------|------|
| `getToolbarScript()` | ~1250行 | バンドル版に統一 |
| `getToolbarJs()` | ~15行 | 動的結合が不要に |
| `loadBundledScript()` | ~20行 | router.ts に移動 |

### 3. injectToolbar の変更

```typescript
// Before
export function injectToolbar(html: string, basePath: string): string

// After
export function injectToolbar(
  html: string,
  basePath: string,
  config: ToolbarConfig = DEFAULT_TOOLBAR_CONFIG
): string {
  const configScript = `<script>window.__TOOLBAR_CONFIG__ = ${JSON.stringify(config)};</script>`;
  // config → HTML, toolbar.js は静的参照
}
```

### 4. ETag によるキャッシュ戦略

```typescript
// router.ts
function serveToolbarJs(req, res): void {
  const { content, etag } = loadToolbarJs();

  // If-None-Match ヘッダーで条件付きリクエスト
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': '...' });
    return;
  }

  res.writeHead(200, {
    ETag: etag,  // MD5 ハッシュ
    'Cache-Control': 'public, max-age=0, must-revalidate'
  });
}
```

### 5. ビルドフロー変更

```
scripts/build-toolbar.mjs:
  - 出力先: dist/toolbar.bundle.js → dist/toolbar.js
  - 変更なし: esbuild で client/index.ts をバンドル
```

## Consequences

### Positive

- **コード削減**: toolbar/index.ts が 1351行 → 56行
- **キャッシュ効率**: config が変わっても toolbar.js は 304 で済む
- **シンプルな配信**: 完全に静的なファイル配信
- **デバッグ容易**: ブラウザで toolbar.js をそのまま確認可能

### Negative

- **HTML サイズ微増**: config JSON が HTML に埋め込まれる（約 100 バイト）
- **毎回サーバー問い合わせ**: `max-age=0` により常に ETag 確認が発生

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/daemon/toolbar/index.ts` | `getToolbarScript`, `getToolbarJs` 削除、`injectToolbar` に config 追加 |
| `src/daemon/http-proxy.ts` | `injectToolbar` に config を渡す |
| `src/daemon/router.ts` | 静的ファイル配信 + ETag 対応 |
| `src/daemon/toolbar/index.test.ts` | 削除した関数のテスト削除、config 埋め込みテスト追加 |
| `scripts/build-toolbar.mjs` | 出力先を `dist/toolbar.js` に変更 |

## Notes

### キャッシュ動作

| シナリオ | レスポンス | ボディ転送 |
|---------|----------|----------|
| 初回アクセス | 200 OK | あり |
| 再アクセス（変更なし） | 304 Not Modified | なし |
| 再アクセス（更新後） | 200 OK | あり |

### 関連 ADR

- ADR 015: Toolbar Module Architecture - 元のモジュール分離設計
- ADR 016: Toolbar Configuration - 設定の外部化

### テストカバレッジ

新規テスト追加:
- `injectToolbar` の config 埋め込みテスト
- router.ts の ETag 処理テスト（TODO）
