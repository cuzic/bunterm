# ADR 049: xterm.js Mouse Tracking Reset

## ステータス

採用

## コンテキスト

Native Terminal モードで tmux を使用しない場合、マウスを動かすとターミナルにゴミ文字（`0;27;10M32;27;10M...`）が表示される問題が発生した。

### 原因

xterm.js はマウストラッキングの状態をクライアント側で保持する。以下のシナリオで問題が発生：

1. vim や less などマウス対応アプリを起動
2. アプリがマウストラッキングを有効化（DECSET 1000/1002/1003）
3. 終了時にマウストラッキングを無効化せずに終了
4. **または** WebSocket 再接続で PTY 側の状態がリセット
5. xterm.js 側ではマウストラッキングが ON のまま
6. マウス移動 → xterm.js がエスケープシーケンスを送信
7. シェルがそれを解釈できずゴミ文字として表示

### tmux 使用時に問題が起きない理由

tmux はターミナルの状態を管理しており、接続ごとに状態を同期する。

## 決定

WebSocket 接続時に xterm.js のマウストラッキング状態をリセットする。

### リセットシーケンス

```typescript
private resetMouseTracking(): void {
  if (!this.terminal) return;
  this.terminal.write(
    '\x1b[?1000l' + // X10 mouse mode OFF
    '\x1b[?1002l' + // Button-event tracking OFF
    '\x1b[?1003l' + // Any-event tracking OFF
    '\x1b[?1006l' + // SGR extended mouse mode OFF
    '\x1b[?1015l'   // URXVT mouse mode OFF
  );
}
```

### モードの説明

| モード | DEC コード | 説明 |
|--------|-----------|------|
| X10 | 1000 | クリック時のみ報告 |
| Button-event | 1002 | ボタン押下/リリースを報告 |
| Any-event | 1003 | マウス移動も報告 |
| SGR | 1006 | 座標を SGR 形式で報告（> 223 対応） |
| URXVT | 1015 | 座標を URXVT 形式で報告 |

### 呼び出しタイミング

```typescript
ws.onopen = () => {
  // 接続成功後にリセット
  this.resetMouseTracking();
  // ...
};
```

再接続時も同様にリセットされる。

## 代替案

### 案1: マウスシーケンスのフィルタリング

PTY に送信する前にマウスエスケープシーケンスをフィルタリング：

```typescript
// filterMouseReporting オプション
terminal.onData((data) => {
  if (this.options.filterMouseReporting) {
    data = filterMouseSequences(data);
    if (!data) return;
  }
  this.send({ type: 'input', data });
});
```

**不採用理由**: vim、tmux、マウス対応アプリでマウスが使えなくなる。

### 案2: PTY 側でのリセット

サーバー側で接続時に DECSET シーケンスを送信：

```typescript
pty.write('\x1b[?1000l\x1b[?1002l\x1b[?1003l');
```

**不採用理由**: 問題は xterm.js 側の状態なので、クライアント側でリセットする方が適切。

## 実装

### 変更ファイル

- `terminal-client.ts`: `resetMouseTracking()` メソッド追加、WebSocket open イベントで呼び出し
- `xterm-bundle.ts`: マウスシーケンス判定・フィルタリング関数（オプション機能として残存）

### フィルタリング関数（参考実装）

```typescript
// xterm-bundle.ts
export function containsMouseSequence(data: string): boolean {
  return /\x1b\[<?\d+;\d+;\d+[Mm]/.test(data) ||
         /\x1b\[M[\x20-\xff]{3}/.test(data);
}

export function filterMouseSequences(data: string): string {
  return data
    .replace(/\x1b\[<?\d+;\d+;\d+[Mm]/g, '')
    .replace(/\x1b\[M[\x20-\xff]{3}/g, '');
}
```

デフォルトでは無効（`filterMouseReporting: false`）。

## 結果

### 利点

- tmux なしでもマウス移動時のゴミ文字が出ない
- vim、less、mc などのマウス対応アプリは正常に動作
- 再接続時も状態が正しくリセット

### 欠点

- なし（マウス対応アプリは自身でトラッキングを有効化するため影響なし）

## 関連 ADR

- [ADR 038: Native Terminal Bun](./038-native-terminal-bun.md) - ネイティブターミナル実装
