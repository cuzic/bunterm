# ADR 015: Toolbar Module Architecture

## Status

Accepted

## Context

### 問題: ime-helper.ts の肥大化

`ime-helper.ts` は当初 IME 入力支援のみだったが、以下の機能が追加され 846 行に膨れ上がった:

- IME 入力支援（日本語入力）
- フォントサイズズーム
- コピー/ペースト
- タッチジェスチャー
- モディファイアキー（Ctrl, Alt, Shift）
- ダブルタップ Enter
- ピンチズーム
- スクロールモード

### 問題点

1. **名前が不適切**: "IME helper" は機能の一部しか表していない
2. **巨大な文字列**: CSS + HTML + JS が 1 つのテンプレートに混在
3. **キャッシュ不可**: 毎回 HTML に inline 展開
4. **テスト困難**: ブラウザコードが分離されていない

## Decision

### 1. モジュール分割

```
src/daemon/toolbar/
├── index.ts           # エクスポート、inject 関数
├── config.ts          # localStorage キー定数
├── styles.ts          # CSS（テンプレート文字列）
├── template.ts        # HTML 構造
└── index.test.ts      # ユニットテスト
```

### 2. 外部スクリプト配信

**Before (inline):**
```html
</body>
↓
<style>...</style>
<div>...</div>
<script>/* 800行のJS */</script>
</body>
```

**After (外部参照):**
```html
</body>
↓
<style>...</style>
<div>...</div>
<script src="/ttyd-mux/toolbar.js"></script>
</body>
```

### 3. 配信方式の決定

| 要素 | 配信方式 | 理由 |
|------|---------|------|
| CSS | inline | FOUC (Flash of Unstyled Content) 回避 |
| HTML | inline | DOM が即座に必要 |
| JS | 外部ファイル | キャッシュ可能、デバッグ容易 |

### 4. ルーティング追加

```typescript
// router.ts
if (url === `${basePath}/toolbar.js`) {
  serveToolbarJs(config, res);
  return;
}
```

レスポンスヘッダー:
```
Content-Type: application/javascript
Cache-Control: public, max-age=3600
```

## Consequences

### Positive

- **名前が適切に**: "toolbar" として機能を正確に反映
- **メンテナンス性向上**: CSS/HTML/JS が分離
- **キャッシュ可能**: 外部 JS はブラウザキャッシュ対象（1時間）
- **デバッグ容易**: DevTools で個別ファイルとして表示
- **テスト可能**: 設定値や構造を個別テスト可能

### Negative

- **追加のHTTPリクエスト**: 初回アクセス時に toolbar.js を取得
- **ファイル数増加**: 1 ファイル → 5 ファイル

### Neutral

- **総行数は微増**: 分割によるボイラープレート増加

## Notes

### inject の流れ

```
http-proxy.ts
  └── injectToolbar(html, basePath)
        ├── <style>${toolbarStyles}</style>     ← inline
        ├── ${toolbarHtml}                       ← inline
        ├── ${onboardingHtml}                    ← inline
        └── <script src="toolbar.js"></script>   ← 外部参照
```

### キャッシュ戦略

| リソース | Cache-Control | 理由 |
|---------|---------------|------|
| toolbar.js | 1 hour | 設定変更時に再読み込みが必要 |
| manifest.json | 1 day | 滅多に変更しない |
| icon-*.png | 1 day | 滅多に変更しない |

### 関連コミット

- `8831d35 feat(toolbar): add config and styles modules`
- `e21023c feat(toolbar): add HTML template module`
- `6a9be9b feat(toolbar): add main module with script generation`
- `3f3a1bf test(toolbar): add unit tests for toolbar module`
- `f56c9fd feat(router): add /toolbar.js route`
- `e452ba0 refactor(http-proxy): migrate to toolbar module`
- `5279e2c chore: remove deprecated ime-helper module`

### 関連 ADR

- ADR 002: IME Helper and Proxy Improvements - 元となった IME ヘルパー
- ADR 003: Mobile Input Enhancements - モバイル入力機能
- ADR 011: Module Cohesion Improvement - モジュール分割の方針
