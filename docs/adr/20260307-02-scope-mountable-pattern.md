# ADR 057: Scope/Mountable Pattern

## ステータス

採用

## コンテキスト

ブラウザ側コード（toolbar/、terminal/）において、イベントリスナーの管理に課題があった：

1. **メモリリーク**: `addEventListener` の対応する `removeEventListener` が漏れがち
2. **クリーンアップの複雑性**: 複数のリスナーを個別に追跡する必要がある
3. **mitt イベント**: EventBus（mitt）の `on` も同様にリーク対象
4. **初期化の一貫性**: マネージャー間で初期化パターンがバラバラ

## 決定

`Scope` と `Mountable` パターンを導入し、ライフサイクル管理を統一する。

### Scope クラス

リソース（主にイベントリスナー）のクリーンアップを管理。

```typescript
// browser/shared/lifecycle.ts
export class Scope {
  private cleanups: (() => void)[] = [];

  add(cleanup: () => void): () => void {
    this.cleanups.push(cleanup);
    return cleanup;
  }

  close(): void {
    for (const cleanup of this.cleanups) {
      cleanup();
    }
    this.cleanups = [];
  }
}
```

### on() ユーティリティ

DOM イベントを Scope に登録可能な形式で返す。

```typescript
export function on<K extends keyof HTMLElementEventMap>(
  element: HTMLElement | Document | Window,
  event: K,
  handler: (e: HTMLElementEventMap[K]) => void,
  options?: AddEventListenerOptions
): () => void {
  element.addEventListener(event, handler as EventListener, options);
  return () => element.removeEventListener(event, handler as EventListener, options);
}

// 使用例
scope.add(on(document, 'click', handleClick));
scope.add(on(element, 'input', handleInput, { passive: true }));
```

### onBus() ユーティリティ

mitt イベントを Scope に登録可能な形式で返す。

```typescript
export function onBus<T, K extends keyof T>(
  emitter: Emitter<T>,
  event: K,
  handler: (e: T[K]) => void
): () => void {
  emitter.on(event, handler);
  return () => emitter.off(event, handler);
}

// 使用例
scope.add(onBus(toolbarEvents, 'font:change', handleFontChange));
```

### Mountable インターフェース

マネージャークラスが実装するインターフェース。

```typescript
export interface Mountable {
  mount(scope: Scope): void;
}

// 実装例
export class MyManager implements Mountable {
  private elements: { btn: HTMLElement } | null = null;

  bindElements(elements: { btn: HTMLElement }): void {
    this.elements = elements;
  }

  mount(scope: Scope): void {
    if (!this.elements) return;
    scope.add(on(this.elements.btn, 'click', () => this.handleClick()));
  }
}
```

### ToolbarApp 初期化シーケンス

```typescript
const scope = new Scope();

// 1. マネージャー生成
const manager = new MyManager(config);

// 2. DOM バインド
manager.bindElements({ btn: document.getElementById('btn')! });

// 3. マウント（イベント登録）
manager.mount(scope);

// アプリ終了時（SPA のアンマウント等）
scope.close();
```

## 関連パターン

### KeyRouter

Escape キーなど複数箇所で処理されるキーの優先度管理。

```typescript
const keyRouter = new KeyRouter();
keyRouter.mount(scope);

scope.add(keyRouter.register((e) => {
  if (e.key !== 'Escape' || !modal.isVisible()) return false;
  modal.hide();
  return true;  // イベント消費（下位に伝播しない）
}, KeyPriority.MODAL));
```

### bindClickScoped

クリックハンドラの簡易登録。

```typescript
import { bindClickScoped } from '@/browser/shared/utils.js';

bindClickScoped(scope, saveBtn, () => this.save());
```

## 代替案

### React/Vue のライフサイクル

React の useEffect や Vue の onMounted を使用。

**採用しなかった理由**:
- toolbar/ は Vanilla JS（React 非使用）
- フレームワーク依存を避けたい

### WeakRef によるリスナー管理

WeakRef で自動的にリスナーを解放。

**採用しなかった理由**:
- GC タイミングが不明確
- 明示的なクリーンアップの方が信頼性が高い

### Disposable パターン（TC39 Proposal）

`Symbol.dispose` を使った明示的リソース管理。

**採用しなかった理由**:
- まだ Stage 3 で実験的
- 将来的な移行は検討

## 影響

### Positive

- **メモリリーク防止**: すべてのリスナーが確実にクリーンアップ
- **コードの一貫性**: 統一されたパターンで可読性向上
- **テスタビリティ**: Scope を渡すことでリスナー登録をモック可能

### Negative

- **学習コスト**: 新しいパターンの習得が必要
- **冗長性**: 単純なケースでもパターンに従う必要がある

## 関連

- ADR 033: Toolbar Client Refactoring（EventBus、utils.ts）
- docs/browser-api.md（詳細なドキュメント）

## 関連コミット

- `da4c19f refactor(terminal-ui): unify event handling with Scope and KeyRouter`
