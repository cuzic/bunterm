# Browser API ガイド

ブラウザ側コード (`browser/`) の開発ガイド。

## ディレクトリ構造

```
src/browser/
├── shared/           # 共通ユーティリティ
│   ├── lifecycle.ts  # Scope/Mountable パターン
│   ├── events.ts     # イベントバス
│   ├── key-router.ts # キーボード優先度管理
│   ├── types.ts      # 共通型定義
│   └── utils.ts      # ユーティリティ関数
├── toolbar/          # ツールバー UI
│   ├── index.ts      # ToolbarApp エントリ
│   └── *Manager.ts   # 各機能マネージャー
└── terminal/         # xterm.js 関連
    ├── terminal-client.ts
    └── app/          # React AI チャット
```

---

## ライフサイクル管理

### Scope パターン

イベントリスナーのメモリリークを防止するため、`Scope` でリスナーを管理します。

```typescript
import { type Scope, on, onBus } from '@/browser/shared/lifecycle.js';
import { toolbarEvents } from '@/browser/shared/events.js';

// Scope を作成
const scope = new Scope();

// DOM イベント登録
scope.add(on(document, 'click', handler));
scope.add(on(element, 'input', handler, { passive: true }));

// イベントバス登録
scope.add(onBus(toolbarEvents, 'font:change', handler));

// 終了時にまとめて解除
scope.close();
```

**基本原則:**
- `addEventListener` を直接使わず `on()` を使用
- mitt の `on` も `onBus()` 経由で使用
- すべてのリスナーは `Scope` に登録

### Mountable パターン

マネージャークラスは `Mountable` を実装し、`mount(scope)` でリスナーを登録します。

```typescript
import { type Mountable, type Scope, on } from '@/browser/shared/lifecycle.js';

export class MyManager implements Mountable {
  private elements: { btn: HTMLElement } | null = null;

  // DOM 要素のバインド（参照のみ保存）
  bindElements(elements: { btn: HTMLElement }): void {
    this.elements = elements;
  }

  // イベントリスナー登録
  mount(scope: Scope): void {
    if (!this.elements) return;

    scope.add(on(this.elements.btn, 'click', () => this.handleClick()));
    scope.add(on(document, 'keydown', (e) => this.handleKey(e as KeyboardEvent)));
  }

  private handleClick(): void { /* ... */ }
  private handleKey(e: KeyboardEvent): void { /* ... */ }
}
```

---

## イベントバス

`toolbarEvents` でコンポーネント間の疎結合な通信を実現します。

### イベント一覧

```typescript
type ToolbarEvents = {
  // ペースト操作
  'paste:request': undefined;
  'text:send': string;
  'clipboard:copy': string;

  // モーダル制御
  'modal:open': ModalName;   // 'snippet' | 'preview' | 'share' | 'file' | 'clipboard-history' | 'session'
  'modal:close': ModalName;

  // ツールバー UI
  'toolbar:toggle': undefined;
  'search:toggle': undefined;

  // 通知
  'notification:bell': undefined;

  // フォント
  'font:change': number;

  // セッション
  'session:open': undefined;

  // アップロード
  'upload:progress': { current: number; total: number };
  'upload:complete': string[];

  // エラー
  error: Error;
};
```

### 使用例

```typescript
import { toolbarEvents } from '@/browser/shared/events.js';
import { onBus } from '@/browser/shared/lifecycle.js';

// イベント購読（Scope 経由）
scope.add(onBus(toolbarEvents, 'font:change', (size) => {
  console.log('Font size changed:', size);
}));

// イベント発火
toolbarEvents.emit('font:change', 16);
toolbarEvents.emit('modal:open', 'snippet');
```

---

## キーボード優先度管理

複数箇所で同じキー（Escape 等）を処理する場合、`KeyRouter` で優先度を管理します。

```typescript
import { KeyRouter, KeyPriority } from '@/browser/shared/key-router.js';

const keyRouter = new KeyRouter();
keyRouter.mount(scope);

// 優先度の高い順に処理（true を返すと下位に伝播しない）
scope.add(keyRouter.register((e) => {
  if (e.key !== 'Escape' || !modal.isVisible()) return false;
  modal.hide();
  return true;  // イベント消費
}, KeyPriority.MODAL));
```

### 優先度定数

| 定数 | 値 | 用途 |
|------|-----|------|
| `CRITICAL` | 200 | 最優先（画像プレビュー等） |
| `MODAL_HIGH` | 100 | 高優先モーダル |
| `MODAL` | 80 | 通常モーダル |
| `PANE` | 60 | ペイン |
| `SEARCH` | 40 | 検索バー |
| `GLOBAL` | 0 | グローバルショートカット |

---

## ユーティリティ関数

### bindClickScoped

クリックイベントを Scope に登録します（preventDefault 自動付与）。

```typescript
import { bindClickScoped } from '@/browser/shared/utils.js';

// ボタンクリック登録
bindClickScoped(scope, saveBtn, () => this.save());
bindClickScoped(scope, cancelBtn, () => this.cancel());
```

### その他

```typescript
import { isMobileDevice, getSessionNameFromURL, truncateText } from '@/browser/shared/utils.js';

// モバイル判定
if (isMobileDevice()) { /* ... */ }

// URL からセッション名取得
const session = getSessionNameFromURL('/bunterm');  // URL: /bunterm/my-session/

// テキスト省略
truncateText('hello world', 8);  // 'hello...'
```

---

## マネージャー分類

| 種別 | 特徴 | Mountable | 例 |
|------|------|-----------|-----|
| UI マネージャー | モーダル・UI 操作 | ○ | ShareManager, SnippetManager |
| データマネージャー | localStorage 等 | × | StorageManager, FontSizeManager |
| アドオンマネージャー | xterm アドオン | × | SearchManager, LinkManager |
| ハンドラー | イベント処理専用 | ○ | TouchGestureHandler, LayoutManager |

---

## ToolbarApp 初期化シーケンス

`browser/toolbar/index.ts` の `ToolbarApp` が各マネージャーを初期化します。

```typescript
const scope = new Scope();

// 1. マネージャー生成（依存関係注入）
const shareManager = new ShareManager(config);
const snippetManager = new SnippetManager(config);

// 2. DOM バインド
shareManager.bindElements({ shareBtn, modal, ... });
snippetManager.bindElements({ snippetBtn, modal, ... });

// 3. マウント（イベント登録）
shareManager.mount(scope);
snippetManager.mount(scope);

// 4. KeyRouter 登録（優先度管理）
scope.add(keyRouter.register((e) => {
  if (e.key === 'Escape' && shareManager.isVisible()) {
    shareManager.hide();
    return true;
  }
  return false;
}, KeyPriority.MODAL));

// アプリ終了時
scope.close();
```

---

## 新規 Feature Client の追加

### 1. ファイル作成

```
src/features/my-feature/
├── client/
│   └── MyFeatureManager.ts
└── server/
    └── ...
```

### 2. マネージャー実装

```typescript
// src/features/my-feature/client/MyFeatureManager.ts
import { type Mountable, type Scope, on } from '@/browser/shared/lifecycle.js';
import { bindClickScoped } from '@/browser/shared/utils.js';
import type { TerminalUiConfig } from '@/browser/shared/types.js';

export class MyFeatureManager implements Mountable {
  private config: TerminalUiConfig;
  private elements: { btn: HTMLElement; modal: HTMLElement } | null = null;

  constructor(config: TerminalUiConfig) {
    this.config = config;
  }

  bindElements(elements: { btn: HTMLElement; modal: HTMLElement }): void {
    this.elements = elements;
  }

  mount(scope: Scope): void {
    if (!this.elements) return;

    bindClickScoped(scope, this.elements.btn, () => this.toggle());
    scope.add(on(this.elements.modal, 'click', (e) => {
      if (e.target === this.elements!.modal) this.hide();
    }));
  }

  toggle(): void { /* ... */ }
  show(): void { /* ... */ }
  hide(): void { /* ... */ }
  isVisible(): boolean { /* ... */ }
}
```

### 3. ToolbarApp に統合

`browser/toolbar/index.ts` に追加:

```typescript
import { MyFeatureManager } from '@/features/my-feature/client/MyFeatureManager.js';

// マネージャー生成
this.myFeature = new MyFeatureManager(config);

// DOM バインド
this.myFeature.bindElements({
  btn: document.getElementById('my-feature-btn')!,
  modal: document.getElementById('my-feature-modal')!,
});

// マウント
this.myFeature.mount(scope);

// KeyRouter 登録（モーダルの場合）
scope.add(keyRouter.register((e) => {
  if (e.key === 'Escape' && this.myFeature.isVisible()) {
    this.myFeature.hide();
    return true;
  }
  return false;
}, KeyPriority.MODAL));
```

### 4. HTML テンプレート更新

`core/server/terminal-ui/template.ts` にボタンとモーダルを追加。
