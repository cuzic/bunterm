# ADR 024: Auto-reload on Tab Visibility

## Status

Accepted

## Context

モバイルブラウザでターミナルを使用する際、以下の問題が発生していた:

### WebSocket 接続の切断

```
1. ユーザーがターミナルタブを開く
2. 別のアプリに切り替える（ホームに戻る、他のアプリを使用）
3. しばらく後にターミナルに戻る
4. WebSocket 接続が切断されており、画面が固まっている
```

### 原因

- モバイル OS はバックグラウンドタブのリソースを積極的に解放
- WebSocket 接続がタイムアウトまたは強制切断される
- ttyd は接続切断時に自動再接続しない

### 手動リロードの問題

- ユーザーが手動でページをリロードする必要がある
- モバイルではリロード操作が面倒（プルダウン or メニュー）
- PWA モード（フルスクリーン）ではリロードボタンがない

## Decision

**Page Visibility API** を使用し、タブがバックグラウンドから復帰した際に自動でページをリロードする。

### 実装

```typescript
// toolbar/template.ts
function getVisibilityReloadScript(): string {
  return `
    (function() {
      let wasHidden = false;

      document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
          wasHidden = true;
        } else if (wasHidden) {
          // バックグラウンドから復帰した場合、リロード
          location.reload();
        }
      });
    })();
  `;
}
```

### 注入場所

ツールバーの HTML テンプレートに含める:

```typescript
// toolbar/template.ts
export function getToolbarHtml(config: ToolbarConfig): string {
  return `
    <!-- ツールバー HTML -->
    <script>
      ${getVisibilityReloadScript()}
      ${getToolbarScript(config)}
    </script>
  `;
}
```

### 動作フロー

```
1. ユーザーがターミナルタブを開く
2. visibilitychange イベントリスナーが登録される
3. ユーザーが別のタブ/アプリに切り替える
   → document.hidden = true, wasHidden = true
4. ユーザーがターミナルに戻る
   → document.hidden = false, wasHidden = true
   → location.reload() が実行される
5. ページがリロードされ、新しい WebSocket 接続が確立
```

## Consequences

### Positive

- **自動復帰**: バックグラウンドから戻った際に自動でリロード
- **接続回復**: WebSocket が切断されていても新規接続で回復
- **PWA 対応**: フルスクリーンモードでもリロードボタン不要
- **軽量実装**: Page Visibility API はすべての主要ブラウザでサポート

### Negative

- **スクロール位置のリセット**: リロードにより端末出力の位置がリセット
  - → tmux のスクロールバックバッファには影響なし
- **入力中のテキスト消失**: 入力途中のコマンドがあれば消える
  - → バックグラウンド遷移前に Enter で確定するのが一般的
- **常にリロード**: 短時間のバックグラウンドでもリロード
  - → 接続が生きている場合は無駄なリロードだが、ユーザー体験への影響は軽微

### Alternative: WebSocket 再接続

```typescript
// 代替案: 再接続を試みる
socket.onclose = () => {
  setTimeout(() => socket.reconnect(), 1000);
};
```

**却下理由:**
- ttyd の内部実装に依存
- xterm.js との状態同期が複雑
- リロードの方がシンプルで確実

## Notes

### ブラウザサポート

| ブラウザ | Page Visibility API |
|---------|-------------------|
| Chrome | ✓ |
| Safari | ✓ |
| Firefox | ✓ |
| Edge | ✓ |
| iOS Safari | ✓ |
| Android Chrome | ✓ |

### テスト方法

1. ターミナルページを開く
2. DevTools Console で確認:
   ```javascript
   document.addEventListener('visibilitychange', () => {
     console.log('hidden:', document.hidden);
   });
   ```
3. 別のタブに切り替えて戻る
4. ページがリロードされることを確認

### 関連コミット

- `6ff555f feat: add auto-reload on tab visibility and dynamic e2e test ports`

### 関連 ADR

- ADR 014: PWA Support - フルスクリーンモードでの使用
- ADR 015: Toolbar Module Architecture - ツールバーの構造
