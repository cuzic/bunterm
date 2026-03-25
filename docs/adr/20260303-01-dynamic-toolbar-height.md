# ADR 051: Dynamic Toolbar Height Calculation

## ステータス

採用

## コンテキスト

モバイルでツールバーを表示/非表示すると、ターミナルの一部がツールバーの後ろに隠れて見えなくなる問題があった。

### 問題の原因

CSS で固定値を使用していた：

```css
/* モバイル向けルール */
body:has(#tui:not(.hidden)) .terminal {
  height: calc(100vh - 120px) !important;
}
```

しかし実際のツールバー高さは約 283px（ボタン群 + 入力エリア）。120px しか確保していないため、163px の重なりが発生。

```
+------------------+
|                  |  ← ターミナル（544px）
|                  |
|==================| ← 380px: ツールバー開始位置
|  [ツールバー]     |  ← 重なり: 544 - 380 = 163px
+------------------+ ← 664px: ビューポート下端
```

### JavaScript による高さ設定が効かない理由

CSS の `!important` ルールが JavaScript のインラインスタイルを上書きしていた：

```typescript
// これは効かない（CSS !important に負ける）
terminalContainer.style.height = `${newHeight}px`;
```

## 決定

### 1. 実際のツールバー高さを測定

`offsetHeight` で実際の高さを取得し、動的に計算：

```typescript
const toolbar = this.elements.container;
const toolbarHeight = toolbar.classList.contains('hidden') ? 0 : toolbar.offsetHeight;
const viewportHeight = window.innerHeight;
const newHeight = viewportHeight - toolbarHeight;
```

### 2. setProperty で !important を上書き

`style.setProperty()` の第3引数で `important` を指定：

```typescript
terminalContainer.style.setProperty('height', `${newHeight}px`, 'important');
```

### 3. xterm.js 内部要素も更新

コンテナだけでなく、xterm.js の内部要素も明示的に高さを設定：

```typescript
const xterm = terminalContainer.querySelector('.xterm');
const xtermViewport = terminalContainer.querySelector('.xterm-viewport');
const xtermScreen = terminalContainer.querySelector('.xterm-screen');

xterm?.style.setProperty('height', '100%', 'important');
xtermViewport?.style.setProperty('height', '100%', 'important');
xtermScreen?.style.setProperty('height', '100%', 'important');
```

### 4. 初回ロード時にも適用

初期化時に `fitAfterToolbarChange()` を呼び出し、CSS の固定値を上書き：

```typescript
// initialize() 内
setTimeout(() => this.fitAfterToolbarChange(), 500);
```

### 5. モバイルでの複数回 fit

モバイルブラウザはレイアウト計算に時間がかかることがあるため、複数回リトライ：

```typescript
if (this.isMobile) {
  setTimeout(adjustAndFit, 50);
  setTimeout(adjustAndFit, 150);
  setTimeout(adjustAndFit, 300);
}
```

## 代替案

### CSS 変数の使用

```css
:root {
  --toolbar-height: 120px;
}
body:has(#tui:not(.hidden)) .terminal {
  height: calc(100vh - var(--toolbar-height));
}
```

JavaScript から `document.documentElement.style.setProperty('--toolbar-height', ...)` で更新。

**採用しなかった理由**: CSS 変数の変更後もレイアウト再計算が必要で、`setProperty('height', ..., 'important')` と実質的に同じ。直接高さを設定するほうがシンプル。

### CSS の !important を削除

CSS から `!important` を削除し、JavaScript のインラインスタイルが優先されるようにする。

**採用しなかった理由**: 初期ロード時（JavaScript 実行前）に正しい高さが適用されないリスク。CSS は初期値として維持し、JavaScript で上書きするほうが安全。

## 影響

### Positive

- ターミナルとツールバーの重なりを解消
- ツールバーサイズの変化（最小化など）に自動対応
- デバイスやブラウザによるツールバーサイズ差異に対応

### Negative

- 500ms の遅延後に高さが再計算されるため、一瞬レイアウトがずれる可能性
- モバイルで最大 300ms の追加リトライ

## テスト

Playwright E2E テスト `e2e/toolbar-resize.spec.ts` で検証：

- ツールバー表示時のオーバーラップ検出
- 表示/非表示トグル後の高さ復元
- xterm.js の行数変化確認

## 関連コミット

- `f38f9c2 fix(mobile): dynamic toolbar height calculation for terminal resize`
- `49cbb7d fix(mobile): add delayed fit calls after font size change`
