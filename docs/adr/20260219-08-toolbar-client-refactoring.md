# ADR 033: Toolbar Client Refactoring

## Status

Accepted

## Context

ツールバークライアントのコードベースが成長し、以下の課題が発生していた：

1. **重複コード** - localStorage 操作、セッション名取得、モバイル判定が各マネージャーで重複
2. **密結合** - マネージャー間の直接メソッド呼び出しによる依存関係
3. **一貫性のなさ** - イベントハンドラのパターン、API 呼び出しの方法が統一されていない
4. **テスタビリティ** - 外部依存（localStorage、fetch）が直接使用されテストが困難

## Decision

以下のリファクタリングパターンを適用する。

### 1. 共通ユーティリティの抽出 (utils.ts)

```typescript
// モバイル判定
export const isMobileDevice = (): boolean =>
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );

// セッション名取得
export function getSessionNameFromURL(basePath: string): string;

// クリックハンドラ統一
export function bindClick(
  element: HTMLElement | null,
  handler: (e: MouseEvent) => void
): () => void;

// テキスト省略
export function truncateText(text: string, maxLength: number, suffix?: string): string;
```

### 2. StorageManager による localStorage 抽象化

Zod スキーマによる型安全な localStorage 管理。

```typescript
const storage = createStorageManager({
  key: STORAGE_KEYS.SNIPPETS,
  schema: snippetStorageSchema,
  defaultValue: { version: 1, snippets: [] },
  migrate: (raw) => /* 旧フォーマットからの移行 */
});

// 使用
const data = storage.load();  // 型付き
storage.save(newData);        // 検証付き
storage.clear();              // クリア
```

適用マネージャー：
- AutoRunManager
- FontSizeManager
- NotificationManager
- ClipboardHistoryManager
- SnippetManager

### 3. ModalController によるモーダル管理

```typescript
const controller = createModalController({
  modal: modalElement,
  closeBtn: closeElement,
  onShow: () => { /* 表示時処理 */ },
  onHide: () => { /* 非表示時処理 */ },
  backdropClose: true,
  escapeClose: true
});

controller.show();
controller.hide();
controller.toggle();
controller.isVisible();
controller.destroy();  // クリーンアップ
```

適用マネージャー：
- ShareManager

### 4. EventBus によるマネージャー間通信

mitt ベースのイベントバスで疎結合を実現。

```typescript
// イベント定義
type ToolbarEvents = {
  'notification:bell': void;
  'font:change': number;
  'modal:open': ModalName;
  'error': Error;
  // ...
};

// 発火
toolbarEvents.emit('font:change', 14);

// 購読
toolbarEvents.on('notification:bell', () => {
  console.log('Bell received');
});
```

適用箇所：
- TerminalController → bell イベント
- TouchGestureHandler → font:change イベント
- index.ts → イベントリスナー

### 5. ApiClient による API 呼び出し統一

```typescript
const client = createApiClient({ basePath: '/ttyd-mux' });

// 使用
const share = await client.createShare(session, '24h');
const publicKey = await client.getVapidKey();
await client.subscribe(subscriptionData);
```

適用マネージャー：
- ShareManager
- NotificationManager

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  ToolbarApp (index.ts)                                      │
│  - マネージャー初期化                                        │
│  - EventBus リスナー設定                                     │
│  - DOM イベントバインディング (bindClick)                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Shared Infrastructure                                      │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌─────────────┐ │
│  │ EventBus  │ │StorageM.  │ │ModalCtrl  │ │  ApiClient  │ │
│  │ (mitt)    │ │ (Zod)     │ │           │ │  (fetch)    │ │
│  └───────────┘ └───────────┘ └───────────┘ └─────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ utils.ts (isMobileDevice, getSessionNameFromURL, etc.) ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Domain Managers                                            │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │Terminal │ │ Share   │ │Snippet  │ │Clipboard│           │
│  │Ctrl     │ │Manager  │ │Manager  │ │History  │           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │Notify   │ │FontSize │ │AutoRun  │ │Smart    │           │
│  │Manager  │ │Manager  │ │Manager  │ │Paste    │           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
└─────────────────────────────────────────────────────────────┘
```

## Consequences

### Positive

- **コード削減**: 重複コードの排除により約 150 行削減
- **テスタビリティ**: StorageManager、ApiClient は DI 可能
- **一貫性**: 統一されたパターンで新機能追加が容易
- **疎結合**: EventBus により変更の影響範囲が限定的
- **型安全性**: Zod スキーマによる実行時検証

### Negative

- **学習コスト**: 新しいパターンの習得が必要
- **間接性**: 抽象化により若干のオーバーヘッド

### Neutral

- **DOMRenderer スキップ**: 標準 Web API (classList, createElement) で十分と判断
- **FontSizeService スキップ**: 既存の EventBus + FontSizeManager で適切に構造化済み

## Changed Files

| ファイル | 変更内容 |
|---------|---------|
| `utils.ts` | 新規作成 - 共通ユーティリティ |
| `utils.test.ts` | 新規作成 - ユーティリティテスト |
| `ModalController.ts` | 新規作成 - モーダル管理 |
| `ModalController.test.ts` | 新規作成 - モーダルテスト |
| `StorageManager.ts` | 既存 - 変更なし |
| `ApiClient.ts` | 既存 - 変更なし |
| `events.ts` | 既存 - 変更なし |
| `AutoRunManager.ts` | StorageManager 統合 |
| `FontSizeManager.ts` | StorageManager 統合 |
| `NotificationManager.ts` | StorageManager + ApiClient 統合 |
| `ClipboardHistoryManager.ts` | StorageManager 統合 |
| `SnippetManager.ts` | StorageManager 統合 |
| `ShareManager.ts` | ModalController + ApiClient 統合 |
| `TerminalController.ts` | EventBus 統合 |
| `TouchGestureHandler.ts` | EventBus 統合 |
| `index.ts` | bindClick, EventBus リスナー |

## Test Coverage

全 668 テストが通過。新規テスト：
- `utils.test.ts`: 8 テスト
- `ModalController.test.ts`: 12 テスト
