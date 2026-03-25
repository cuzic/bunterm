# ADR 014: PWA Support for Mobile

## Status

Accepted

## Context

モバイルブラウザでターミナルを使用する際の問題:

1. **アドレスバーが邪魔**: 画面の一部を占有し、ターミナル領域が狭くなる
2. **ホーム画面からのアクセス**: 毎回 URL を入力する必要がある
3. **アプリ感覚での使用**: ネイティブアプリのように使いたい

## Decision

**PWA (Progressive Web App) 対応**を実装する。

### manifest.json の提供

ポータルページから `manifest.json` へのリンクを追加:

```html
<link rel="manifest" href="/ttyd-mux/manifest.json">
```

### manifest.json の内容

```json
{
  "name": "ttyd-mux Terminal",
  "short_name": "Terminal",
  "start_url": "/ttyd-mux/",
  "display": "standalone",
  "background_color": "#1e1e1e",
  "theme_color": "#007acc",
  "icons": [
    { "src": "/ttyd-mux/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/ttyd-mux/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

| プロパティ | 値 | 効果 |
|-----------|-----|------|
| `display: standalone` | フルスクリーン表示 | アドレスバーなし |
| `background_color` | `#1e1e1e` | スプラッシュ画面の背景色 |
| `theme_color` | `#007acc` | ステータスバーの色 |

### アイコンの動的生成

SVG からランタイムで PNG を生成（外部ファイル不要）:

```typescript
function generatePwaIcon(size: number): Buffer {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect fill="#1e1e1e" width="${size}" height="${size}"/>
    <text x="50%" y="55%" text-anchor="middle" fill="#007acc"
          font-size="${size * 0.5}px" font-family="monospace">&gt;_</text>
  </svg>`;
  return Buffer.from(svg);
}
```

### ルーティング追加

```typescript
// router.ts
if (url === `${basePath}/manifest.json`) {
  serveManifest(basePath, res);
  return;
}
if (url === `${basePath}/icon-192.png`) {
  servePwaIconPng(res, 192);
  return;
}
if (url === `${basePath}/icon-512.png`) {
  servePwaIconPng(res, 512);
  return;
}
```

## Consequences

### Positive

- **フルスクリーン**: モバイルでアドレスバーなしの全画面表示
- **ホーム画面追加**: iOS/Android でホーム画面にアイコンを追加可能
- **オフライン不要**: サーバー接続が必須のため Service Worker は不要
- **外部依存なし**: アイコンを動的生成するため画像ファイル不要

### Negative

- **iOS の制限**: iOS では PWA の機能が制限される
- **キャッシュ**: manifest.json の変更がすぐに反映されない場合がある

### Neutral

- **インストールプロンプト**: ブラウザが自動で「ホーム画面に追加」を提案

## Notes

### 対応ブラウザ

| ブラウザ | standalone 表示 | ホーム画面追加 |
|---------|----------------|---------------|
| Chrome (Android) | ✓ | ✓ |
| Safari (iOS) | ✓ | ✓ |
| Firefox (Android) | ✓ | ✓ |
| Edge (Android) | ✓ | ✓ |

### ホーム画面への追加手順

**Android (Chrome):**
1. ポータルページを開く
2. メニュー → 「ホーム画面に追加」

**iOS (Safari):**
1. ポータルページを開く
2. 共有ボタン → 「ホーム画面に追加」

### 関連コミット

- `7926d00 feat(pwa): add PWA support for fullscreen mobile launch`
