# ADR 044: Warp 風ブロック UI 実装

## Status

Accepted

## Context

OSC 633 シェル統合により、コマンドの開始・終了を検出できるようになった。これを活用して、Warp ターミナルのような「コマンドブロック」UI を実装する。

### Warp のブロック UI

Warp ターミナルは、各コマンドを視覚的なブロックとして表示：

- コマンドごとに明確な境界
- プロンプト + コマンド + 出力 を1つのまとまりとして表示
- 成功/失敗の視覚的フィードバック
- ブロック単位でのコピー、AI 分析

### 目標

1. **視覚的分離**: コマンドごとにブロック境界を表示
2. **状態表示**: 実行中/成功/失敗をアイコンで表示
3. **操作性**: ブロック単位でコピー、折りたたみ
4. **AI 連携**: 選択ブロックの AI 分析（将来）

## Decision

**BlockModel + BlockManager + BlockRenderer アーキテクチャ**を採用する。

### コンポーネント構成

```
┌─────────────────────────────────────────────────────────────────┐
│                      Browser (xterm.js)                          │
├─────────────────────────────────────────────────────────────────┤
│  BlockManager                    BlockRenderer                   │
│  ├─ OSC 633 パーシング          ├─ ブロック境界ライン描画       │
│  ├─ BlockModel 管理             ├─ ステータスアイコン           │
│  └─ イベント発火                └─ ブロックインジケータ        │
├─────────────────────────────────────────────────────────────────┤
│                      terminal-client.ts                          │
│  ├─ WebSocket 通信                                               │
│  └─ 出力フィルタ（OSC 除去）                                    │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Server (ttyd-mux)                           │
│  ├─ TerminalSession (Bun.Terminal)                               │
│  ├─ OSC 633 検出・ブロック管理                                   │
│  └─ WebSocket: block.start, block.end メッセージ送信            │
└─────────────────────────────────────────────────────────────────┘
```

### WebSocket プロトコル拡張

```typescript
// サーバー → クライアント
type ServerMessage =
  | { type: 'output'; data: string }
  | { type: 'block_start'; block: BlockInfo }    // 新規
  | { type: 'block_end'; blockId: string; exitCode: number }  // 新規
  | { type: 'block_output'; blockId: string; data: string }   // 新規
  | { type: 'block_list'; blocks: BlockInfo[] }   // 接続時の初期化
  | ...;

interface BlockInfo {
  id: string;
  command?: string;
  status: 'running' | 'success' | 'error';
  startLine: number;
  endLine?: number;
  exitCode?: number;
}
```

### サーバー側: OSC 633 パーシング

```typescript
// terminal-session.ts
private processOsc633(code: string, params: string[]): void {
  switch (code) {
    case 'A':  // プロンプト開始
      this.startNewBlock();
      break;
    case 'C':  // コマンド実行開始
      if (this.currentBlock) {
        this.currentBlock.status = 'running';
        this.broadcastBlockStart(this.currentBlock);
      }
      break;
    case 'D':  // コマンド完了
      if (this.currentBlock) {
        const exitCode = parseInt(params[0] || '0', 10);
        this.currentBlock.status = exitCode === 0 ? 'success' : 'error';
        this.currentBlock.exitCode = exitCode;
        this.broadcastBlockEnd(this.currentBlock);
      }
      break;
    case 'E':  // コマンド内容
      if (this.currentBlock) {
        this.currentBlock.command = params.join(';');
      }
      break;
  }
}
```

### クライアント側: BlockManager

```typescript
// BlockManager.ts
class BlockManager {
  private blocks: Map<string, BlockInfo> = new Map();
  private listeners: Set<(event: BlockEvent) => void> = new Set();

  handleMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'block_start':
        this.blocks.set(message.block.id, message.block);
        this.emit({ type: 'started', block: message.block });
        break;
      case 'block_end':
        const block = this.blocks.get(message.blockId);
        if (block) {
          block.status = message.exitCode === 0 ? 'success' : 'error';
          block.exitCode = message.exitCode;
          this.emit({ type: 'ended', block });
        }
        break;
      case 'block_list':
        for (const block of message.blocks) {
          this.blocks.set(block.id, block);
        }
        this.emit({ type: 'initialized', blocks: message.blocks });
        break;
    }
  }
}
```

### クライアント側: BlockRenderer

```typescript
// BlockRenderer.ts
class BlockRenderer {
  constructor(
    private terminal: Terminal,
    private blockManager: BlockManager
  ) {
    this.blockManager.addEventListener((event) => {
      switch (event.type) {
        case 'started':
          this.renderBlockStart(event.block);
          break;
        case 'ended':
          this.renderBlockEnd(event.block);
          break;
      }
    });
  }

  private renderBlockStart(block: BlockInfo): void {
    // xterm.js のデコレーションAPI でブロック開始を表示
    const startLine = this.terminal.buffer.active.cursorY;
    block.startLine = startLine + this.terminal.buffer.active.baseY;

    // 左端にインジケータ（青い縦線）
    this.addDecoration(block.startLine, 'block-indicator running');
  }

  private renderBlockEnd(block: BlockInfo): void {
    block.endLine = this.terminal.buffer.active.cursorY +
                    this.terminal.buffer.active.baseY;

    // インジケータを更新（緑=成功、赤=失敗）
    const className = block.status === 'success' ? 'success' : 'error';
    this.updateDecoration(block.startLine, `block-indicator ${className}`);

    // ステータスアイコン表示
    this.showStatusIcon(block);
  }
}
```

### CSS スタイル

```css
/* ブロックインジケータ（左端の縦線） */
.block-indicator {
  position: absolute;
  left: 0;
  width: 3px;
  background: var(--block-color);
}

.block-indicator.running {
  --block-color: #3b82f6;  /* blue */
}

.block-indicator.success {
  --block-color: #22c55e;  /* green */
}

.block-indicator.error {
  --block-color: #ef4444;  /* red */
}

/* ブロック境界線 */
.block-boundary {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

/* ステータスアイコン */
.block-status-icon {
  position: absolute;
  right: 10px;
  font-size: 14px;
}
```

## Consequences

### Positive

- **視覚的明確さ**: コマンドごとにブロックが分離
- **状態可視化**: 実行中/成功/失敗が一目でわかる
- **操作性向上**: ブロック単位での操作が可能
- **AI 連携準備**: 選択ブロックの分析基盤

### Negative

- **パフォーマンス**: デコレーション描画のオーバーヘッド
- **互換性**: xterm.js のデコレーション API に依存
- **OSC 633 依存**: シェル統合が必要

### 制限事項

- **ブロック上限**: 最新 100 ブロックのみ保持
- **長時間コマンド**: 出力が多いと描画負荷
- **ネスト非対応**: サブシェルのブロックは未対応

## Implementation Details

### ファイル構成

```
src/daemon/native-terminal/
├── terminal-session.ts      # OSC 633 パーシング強化
├── block-model.ts           # ブロックデータモデル
└── types.ts                 # block_start, block_end メッセージ追加

src/daemon/native-terminal/client/
├── BlockManager.ts          # ブロック状態管理
├── BlockRenderer.ts         # 描画処理
└── terminal-client.ts       # 統合
```

### シェル統合スクリプト配信

```
src/daemon/native-terminal/shell-integration/
├── bash.sh                  # Bash 用
└── zsh.sh                   # Zsh 用
```

これらは `/ttyd-mux/shell-integration/bash.sh` 等で配信され、
ユーザーは `.bashrc` / `.zshrc` で `source` できる。

### ブロック境界表示の例

```
┌─ [running] ────────────────────────────────────┐
│ $ npm test                                      │
│                                                 │
│ > project@1.0.0 test                            │
│ > jest                                          │
│                                                 │
│ PASS  src/utils.test.ts                         │
│ PASS  src/index.test.ts                         │
└─────────────────────────────────────────── [✓] ─┘
```

## References

- [Warp Terminal](https://www.warp.dev/)
- [xterm.js Decorations API](https://xtermjs.org/docs/api/terminal/classes/terminal/#registerdecoration)
- [ADR 042: OSC 633 Shell Integration](./042-osc633-shell-integration.md)
- [ADR 038: Bun.Terminal ベースのネイティブターミナル実装](./038-native-terminal-bun.md)
