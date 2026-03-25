# ADR 019: Mobile Scroll Feature

## Status

Accepted

## Context

モバイルブラウザでターミナルを使用する際の問題:

1. **スクロールが困難**: tmux のマウスモードが有効だとタッチスクロールがキャプチャされる
2. **Page Up/Down がない**: モバイルキーボードにはファンクションキーがない
3. **履歴確認が困難**: 長い出力をスクロールして確認できない

## Decision

### 1. スクロールモードボタンの追加

ツールバーに **Scroll** ボタンを追加し、トグルで有効化:

```html
<button id="ttyd-toolbar-scroll" class="modifier">Scroll</button>
```

### 2. Page Up/Down ボタンの追加

直接ページスクロールするボタンを追加:

```html
<button id="ttyd-toolbar-pageup">PgUp</button>
<button id="ttyd-toolbar-pagedown">PgDn</button>
```

### 3. タッチドラッグでスクロール

Scroll モードが有効な時、タッチドラッグを Page Up/Down に変換:

```javascript
// スクロールモードの状態
let scrollActive = false;
let scrollTouchActive = false;
let scrollLastY = 0;
const SCROLL_THRESHOLD = 30; // ピクセル

document.addEventListener('touchmove', function(e) {
  if (scrollTouchActive) {
    const deltaY = scrollLastY - touch.clientY;

    if (Math.abs(deltaY) >= SCROLL_THRESHOLD) {
      if (deltaY > 0) {
        sendPageDown();  // 上にドラッグ → 下にスクロール
      } else {
        sendPageUp();    // 下にドラッグ → 上にスクロール
      }
      scrollLastY = touch.clientY;
    }
  }
});
```

### 4. エスケープシーケンス

```javascript
function sendPageUp() {
  sendBytes([0x1B, 0x5B, 0x35, 0x7E]);  // ESC [ 5 ~
}

function sendPageDown() {
  sendBytes([0x1B, 0x5B, 0x36, 0x7E]);  // ESC [ 6 ~
}
```

### 5. モード間の排他制御

Scroll モードと Shift モード（テキスト選択）は排他的:

```javascript
document.addEventListener('touchstart', function(e) {
  if (scrollActive) {
    // スクロールモード
    scrollTouchActive = true;
    e.preventDefault();
  } else if (shiftActive) {
    // テキスト選択モード
    shiftTouchActive = true;
    dispatchMouseEvent('mousedown', touch, true);
  }
});
```

## Consequences

### Positive

- **スクロール可能**: tmux マウスモードでもスクロールできる
- **直感的操作**: 上にスワイプで下にスクロール（通常のスクロール方向）
- **ボタンでも操作可能**: PgUp/PgDn ボタンで確実にスクロール
- **既存機能との共存**: Shift モード（選択）と排他的に動作

### Negative

- **モード切り替えが必要**: スクロール前に Scroll ボタンをタップ
- **しきい値の調整**: 30px のしきい値が全ユーザーに最適とは限らない

### Neutral

- **状態は非永続**: Scroll モードの ON/OFF はリロードでリセット

## Notes

### 操作方法

1. **Scroll ボタン**をタップ（ボタンがハイライト）
2. 画面を**上にスワイプ** → 下にスクロール（Page Down）
3. 画面を**下にスワイプ** → 上にスクロール（Page Up）
4. **Scroll ボタン**を再度タップで解除

### 他のモードとの比較

| モード | 用途 | タッチ動作 |
|-------|------|-----------|
| 通常 | 入力 | tmux に渡される |
| Shift | 選択 | マウスイベントに変換 |
| Scroll | スクロール | Page Up/Down に変換 |
| Ctrl | 修飾キー | Ctrl+文字を送信 |

### tmux のスクロール

tmux 内でのスクロールは以下でも可能:
- `Ctrl+b [` でコピーモードに入りスクロール
- `Ctrl+b PgUp` でページアップ

しかしモバイルではこれらが困難なため、専用ボタンを提供。

### 関連コミット

- `47a6c9d feat: add mobile scroll, auto persistence, toolbar config, and doctor command`

### 関連 ADR

- ADR 003: Mobile Input Enhancements - モバイル入力機能
- ADR 015: Toolbar Module Architecture - ツールバー構造
