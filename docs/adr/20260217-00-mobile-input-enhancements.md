# ADR 003: Mobile Input Enhancements

## Status

Accepted

## Context

ttyd-mux の IME ヘルパーはモバイルデバイスでの日本語入力を可能にしたが、以下の課題が残っていた：

1. **ttyd 再接続時の操作**: WebSocket 切断後に再接続すると、Enter キーを押すまでターミナルが応答しない。モバイルでは IME ヘルパーを開いて Enter ボタンを押す必要があり煩雑
2. **連続コマンド入力**: 日本語でコマンドを入力するたびに、テキスト送信後に手動で Enter を押す必要がある

## Decision

### 1. ダブルタップで Enter 送信

**決定**: ターミナル領域をダブルタップすると Enter キーを送信する

**実装詳細**:
```javascript
let lastTapTime = 0;
const DOUBLE_TAP_DELAY = 300;  // 300ms 以内の2回タップ

document.addEventListener('touchend', function(e) {
  // IME ヘルパー要素は除外
  if (e.target.closest('#ttyd-ime-container') ||
      e.target.closest('#ttyd-ime-toggle')) {
    return;
  }
  // シングルタッチのみ
  if (e.changedTouches.length !== 1) return;

  const now = Date.now();
  if (now - lastTapTime < DOUBLE_TAP_DELAY) {
    sendEnter();
    lastTapTime = 0;  // リセット
  } else {
    lastTapTime = now;
  }
}, { passive: true });
```

**ユースケース**:
- ttyd 再接続時に IME ヘルパーを開かずに Enter を送信
- 素早く Enter を送りたい場合

### 2. Auto モード（自動 Enter 送信）

**決定**: Auto モードを ON にすると、Send 後に自動で 1 秒待ってから Enter を送信する

**UI**:
- Run ボタンの横に「Auto」トグルボタンを追加
- modifier スタイル（トグル式）だが、色はオレンジ（他の modifier は赤）で区別

**動作**:
```
[Auto OFF] Send → テキストのみ送信
[Auto ON]  Send → テキスト送信 + 1秒後に Enter
```

**1 秒遅延の理由**:
- 日本語 IME で変換確定後、ネットワーク遅延を考慮
- ttyd がテキストを受信・処理する時間を確保
- 既存の Run ボタンと同じ遅延時間で一貫性を維持

### 検討した代替案

#### compositionend イベントでの検知

**検討**: IME の変換確定時（`compositionend` イベント）に Enter を送信する

```javascript
input.addEventListener('compositionend', function(e) {
  if (autoRunActive) {
    sendEnter();
  }
});
```

**採用しなかった理由**:
- `compositionend` は IME 変換確定時のみ発火
- 英数字入力や既存テキストの Send では発火しない
- 「Send ボタンを押したら実行」という明示的な操作のほうがユーザーの意図が明確

**補足**: `compositionend` では以下は検知できない：
- システムレベルの IME ON/OFF 切り替え
- ひらがな/カタカナ/英数モードの切り替え

ブラウザは「変換中かどうか」は公開するが、「IME が有効かどうか」自体は公開していない。

## Consequences

### Positive

- ttyd 再接続時の操作が簡単に（ダブルタップで Enter）
- 連続コマンド入力が効率的に（Auto モードで Send 後自動 Enter）
- IME ヘルパーを開かなくても基本操作が可能

### Negative

- ダブルタップの誤検知リスク（300ms は比較的短い）
- Auto モード ON のまま忘れると意図しない Enter が送信される

### Risks

- 将来的に `compositionend` ベースの実装が必要になった場合、Auto モードとの併存を検討する必要がある

## References

- [compositionend event - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/compositionend_event)
- ttyd WebSocket Protocol: バイナリ形式、`0x0D` (CR) で Enter
