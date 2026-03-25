# ADR 059: Session Plugin による依存逆転

## ステータス

採用

## コンテキスト

ADR 058 で `core/` → `features/` の3層構造を導入したが、`core/terminal/session.ts` が `features/blocks`, `features/claude-watcher`, `features/file-watcher` を直接 import しており、レイヤー違反が残存していた。

### 問題点

```typescript
// core/terminal/session.ts（違反箇所）
import { BlockModel } from '@/features/blocks/server/block-model.js';
import { ClaudeSessionWatcher } from '@/features/claude-watcher/server/index.js';
import { FileWatcher } from '@/features/file-watcher/server/file-watcher.js';
```

1. **依存方向の逆転**: core（下位層）が features（上位層）に依存
2. **features の独立性損失**: TerminalSession を使うには3つの features が必須
3. **テスト困難**: features のモック化ができず、TerminalSession の単体テストが困難
4. **protocol/index.ts も違反**: `ClaudeWatcherMessage` 型を features から import

同様に ADR 009 で導入した DI パターン（ProcessRunner, SocketClient, StateStore）は成功しており、同じアプローチで解決可能だった。

## 決定

**SessionPlugin インターフェース + コンストラクタ DI** パターンを採用し、core に interface、features に implements、daemon に組み立て（composition root）を配置する。

### 新規ファイル

#### `core/terminal/session-plugins.ts`

```typescript
export interface BlockManager {
  readonly activeBlockId: string | null;
  startBlock(command: string, startLine: number): Block;
  endBlock(blockId: string, exitCode: number, endLine: number): Block | null;
  appendOutput(blockId: string, data: string): void;
  // ...
}

export interface SessionWatcher {
  start(): Promise<void>;
  stop(): void;
  on(event: 'message', listener: (msg: ServerMessage) => void): this;
}

export interface FileChangeNotifier {
  watchFile(relativePath: string): void;
  close(): void;
  on(event: 'change', listener: (path: string) => void): this;
}

export interface SessionPlugins {
  blockManager: BlockManager;
  sessionWatcher: SessionWatcher;
  fileChangeNotifier: FileChangeNotifier;
}

// Null Object 実装（feature 無効時用）
export const nullPlugins: SessionPlugins = { ... };
```

#### `core/protocol/extension-messages.ts`

WebSocket メッセージ型（`ClaudeWatcherMessage` 等）を core/protocol に移動。プロトコル定義は core の責務であり、features はこれを re-export する。

### 変更パターン

```
Before:
  session.ts → import BlockModel from features/blocks
  session.ts → import ClaudeSessionWatcher from features/claude-watcher
  session.ts → import FileWatcher from features/file-watcher

After:
  session.ts → import { BlockManager, SessionWatcher, FileChangeNotifier } from './session-plugins.js'
  features/blocks/block-model.ts → implements BlockManager
  features/claude-watcher/session-watcher.ts → implements SessionWatcher
  features/file-watcher/file-watcher.ts → implements FileChangeNotifier
  session-manager.ts → createPlugins() で features を組み立てて注入
```

## 代替案

### イベントバス / Pub-Sub パターン

TerminalSession がイベントを発行し、features が subscribe する。

**採用しなかった理由**:
- 型安全性が低下する（イベント名が文字列）
- features の初期化タイミングが不明確
- 既に ADR 009 の DI パターンがプロジェクトで確立されている

### 動的プラグインローダー

設定ファイルで有効な features を指定し、動的 import でロード。

**採用しなかった理由**:
- 複雑性が大幅に増加
- Tree Shaking が効かなくなる
- ADR 058 で「将来的な拡張として検討」とされており、現時点では過剰

## 影響

### Positive

- `session.ts` から `features/` への import が完全に消滅
- `protocol/index.ts` から `features/` への import が完全に消滅
- TerminalSession が Null Object 注入で features なしにテスト可能
- ADR 058 の「features は独立選択可能」が実現に近づいた

### Negative

- interface の追加による間接層が増加
- session-manager.ts が composition root として features を知る必要がある（ただしこれは意図的な設計）

### command-executor-manager の DI 移行（追加実施）

ADR 059 採用後、`command-executor-manager.ts` も同パターンで DI 化：

- `ExecutorBlockStore` / `ExecutorBlockEventEmitter` インターフェースを `session-plugins.ts` に追加
- `CommandExecutorManager` のコンストラクタが `deps: { blockStore, eventEmitter }` を受け取る形に変更
- `blocks-routes.ts` が composition root として `createBlockStore()` / `createBlockEventEmitter()` を生成・注入

```typescript
// Before: features を直接 import
import { createBlockStore } from '@/features/blocks/server/block-store.js';
import { createBlockEventEmitter } from '@/features/blocks/server/block-event-emitter.js';

// After: interface 経由で DI
constructor(sessionManager, deps: { blockStore: ExecutorBlockStore; eventEmitter: ExecutorBlockEventEmitter })
```

### 残存する core → features 違反

以下は今回のスコープ外。同パターンで段階的に解消可能：

- `core/server/http/routes/api/*.ts` → 各 features（ルート層は integration point として許容）

## 関連

- ADR 009: Dependency Injection for Testability
- ADR 058: Plugin Architecture Migration
