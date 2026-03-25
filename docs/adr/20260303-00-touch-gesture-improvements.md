# ADR 050: Touch Gesture Improvements

## ステータス

採用

## コンテキスト

モバイルターミナルでの操作性向上のため、以下の課題に対応する必要があった：

1. **ピンチズーム**: フォントサイズ変更に修飾キー（Ctrl/Alt）が必要だった
2. **スクロール**: tmux 使用時と非使用時で異なるスクロール方法が必要
3. **キーボード**: ターミナルタップでソフトキーボードがポップアップして邪魔

### 既存の問題点

ADR 019 で定義された Scroll モードは Page Up/Down を送信するが、tmux のマウスモードが有効な場合はマウスホイールイベントが必要。また、xterm.js のローカルスクロールバックを使う場合は `scrollLines()` API が適切。

## 決定

### 1. ピンチズームの改善

修飾キーなしでピンチジェスチャーによるフォントサイズ変更を可能にする。

```typescript
// 2本指タッチ検出でピンチ開始
if (e.touches.length === 2) {
  const distance = Math.hypot(
    e.touches[0].clientX - e.touches[1].clientX,
    e.touches[0].clientY - e.touches[1].clientY
  );
  this.pinchStartDistance = distance;
  this.pinchStartFontSize = this.terminal.getCurrentFontSize();
}
```

**動作**:
- 2本指でピンチイン → フォントサイズ縮小
- 2本指でピンチアウト → フォントサイズ拡大
- 連続的なサイズ変更（しきい値 10% ごと）

### 2. 修飾キー付きスワイプスクロール

Alt キーと Ctrl キーで異なるスクロール方式を選択可能にする。

| 操作 | スクロール方式 | 用途 |
|------|---------------|------|
| Alt + スワイプ | マウスホイール（SGR拡張） | tmux マウスモード |
| Ctrl + スワイプ | xterm.js scrollLines() | ローカルスクロールバック |

```typescript
// Alt + スワイプ: マウスホイールイベント送信
if (this.modifierScrollMode === 'alt') {
  // SGR extended mouse mode: ESC [ < Cb ; Cx ; Cy M
  const button = direction === 'up' ? 64 : 65;
  const pressSeq = `\x1b[<${button};${x};${y}M`;
  this.input.sendWheel(direction, ticks * ALT_SCROLL_MULTIPLIER);
}

// Ctrl + スワイプ: xterm.js ローカルスクロール
if (this.modifierScrollMode === 'ctrl') {
  this.terminal.scrollLines(scrollAmount);
}
```

**パラメータ**:
- `ALT_SCROLL_THRESHOLD = 10`: 1ティックあたりのピクセル数
- `ALT_SCROLL_MULTIPLIER = 3`: 速度倍率

### 3. キーボードポップアップ抑制

ターミナル領域タップ時にソフトキーボードが表示されないようにする。

```typescript
// xterm-helper-textarea にフォーカスが当たらないようにする
terminalElement.addEventListener('touchend', (e) => {
  // ツールバーやモーダルは除外
  if (e.target.closest('#tui') || e.target.closest('.modal')) {
    return;
  }

  // キーボードを表示させない
  const textarea = document.querySelector('.xterm-helper-textarea') as HTMLElement;
  textarea?.blur();
}, { passive: true });
```

### 4. モバイル xterm.js リフレッシュ

モバイルブラウザはタッチ操作中にレンダリングを一時停止することがある。touchend 時に強制リフレッシュを実行。

```typescript
document.addEventListener('touchend', () => {
  if (this.modifierScrollActive) {
    // タッチ終了後に xterm.js を強制再描画
    this.terminal.refresh();
  }
}, { passive: true, capture: true });
```

## 代替案

### tmux 自動検出

当初は tmux の存在を自動検出してスクロール方式を切り替えることを検討した。

**問題点**:
- プロセスツリー検出のタイミング問題
- セッション切り替え時の状態同期
- 実装の複雑さ

**採用しなかった理由**: Alt/Ctrl による明示的な選択のほうがシンプルで確実。

## 影響

### Positive

- 直感的なピンチズーム（修飾キー不要）
- tmux/非 tmux 両方でスムーズなスクロール
- ソフトキーボードの意図しないポップアップを防止
- モバイルでのレンダリング問題を解決

### Negative

- Alt/Ctrl の使い分けをユーザーが覚える必要がある
- 修飾キーボタンを先にタップしてからスワイプが必要

## 関連

- ADR 003: Mobile Input Enhancements
- ADR 019: Mobile Scroll Feature
- ADR 049: xterm.js Mouse Tracking Reset

## 関連コミット

- `54a7017 feat(touch): enable pinch-to-zoom without modifier keys`
- `83c7fde feat(touch): suppress keyboard popup on mobile terminal tap`
- `b6a645e feat(touch): add Alt+swipe scroll for mobile with tmux support`
