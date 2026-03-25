# ADR 045: AI チャット連携とブロックコンテキスト引用

## Status

Proposed

## Context

Command Block API でコマンドをブロック単位で管理できるようになった。次のステップとして、これらのブロックを AI に引用として渡し、エラー分析やコマンド提案を得る機能を実装する。

### 課題

1. **xterm.js のテキスト選択は不安定**: 行折り返し、スクロール、再描画で壊れやすい
2. **生ログの直接引用は危険**: 秘密情報、ノイズ、膨大な出力
3. **コンテキストの可視性**: 何を AI に渡しているか不明確

### 設計原則

> **真実はブロック、xterm はレンダリング先**

xterm.js を "ソースオブトゥルース" にせず、ブロックストア側にデータを持つ。

## Decision

**ブロック選択主体の Context Tray アーキテクチャ**を採用する。

### 画面レイアウト

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Split View                                   │
├─────────────────────────────┬───────────────────────────────────────┤
│                             │                                       │
│      xterm.js Terminal      │         AI Chat Pane                  │
│                             │  ┌─────────────────────────────────┐  │
│  ┌──────────────────────┐   │  │ Context Tray                    │  │
│  │ Block #12 [running]  │◄──┼──│ - Block #10 (npm install) ✓     │  │
│  │ $ npm test           │   │  │ - Block #11 (npm build) ✗       │  │
│  │ > jest               │   │  │ - Block #12 (npm test) ◎        │  │
│  │ FAIL src/...         │   │  │ [Clear] [Expand All] [Error Only]│  │
│  └──────────────────────┘   │  └─────────────────────────────────┘  │
│                             │  ┌─────────────────────────────────┐  │
│  ┌──────────────────────┐   │  │ Chat Thread                     │  │
│  │ Block #13 [queued]   │   │  │ ┌───────────────────────────┐   │  │
│  │ $ ...                │   │  │ │ User: このエラーの原因は？ │  │  │
│  └──────────────────────┘   │  │ └───────────────────────────┘   │  │
│                             │  │ ┌───────────────────────────┐   │  │
│  ◄─ Block Gutter ─►        │  │ │ AI: Block #11 のビルドで… │   │  │
│  (クリックで選択)           │  │ │ [citation: #11]           │   │  │
│                             │  │ └───────────────────────────┘   │  │
│                             │  └─────────────────────────────────┘  │
│                             │  ┌─────────────────────────────────┐  │
│ ◄─────── Splitter ──────►  │  │ Input: [_______________] [Send] │  │
│                             │  │ Suggested: [Retry] [Skip Test]  │  │
│                             │  └─────────────────────────────────┘  │
└─────────────────────────────┴───────────────────────────────────────┘
```

### コンポーネント構成

```
┌─────────────────────────────────────────────────────────────────────┐
│                        React App                                     │
├─────────────────────────────────────────────────────────────────────┤
│  SplitPane (react-resizable-panels)                                  │
│  ├─ TerminalPane                                                     │
│  │   ├─ XtermContainer (xterm.js)                                   │
│  │   ├─ BlockOverlay (ブロック境界、ガター)                          │
│  │   └─ BlockSelectionManager                                       │
│  │                                                                   │
│  └─ AIChatPane                                                       │
│      ├─ ContextTray (選択ブロック一覧)                               │
│      │   ├─ BlockCard (プレビュー、削除、展開)                       │
│      │   └─ RenderModeSelector (短縮/エラーのみ/全文)                │
│      ├─ ChatThread (メッセージ履歴)                                  │
│      │   ├─ UserMessage                                             │
│      │   └─ AIMessage (citations 付き)                              │
│      ├─ ChatInput                                                    │
│      └─ SuggestedActions                                            │
└─────────────────────────────────────────────────────────────────────┘
```

### ブロック選択 UX

#### A) ブロックガター選択（主要）

```
┌─ ガター ─┬─────────────────────────────────┐
│  [ ]     │ $ npm install                   │
│          │ added 234 packages              │
├──────────┼─────────────────────────────────┤
│  [✓]     │ $ npm build                     │  ← Ctrl/⌘+Click で選択
│          │ ERROR: Cannot find module...    │
├──────────┼─────────────────────────────────┤
│  [✓]     │ $ npm test                      │  ← Shift+Click で範囲選択
│          │ FAIL src/utils.test.ts          │
└──────────┴─────────────────────────────────┘
```

- 各ブロックの開始行にクリック可能なガターを配置
- `Ctrl/⌘ + Click`: 個別トグル
- `Shift + Click`: seq 範囲選択
- 選択ブロックは左でハイライト、右の Context Tray に追加

#### B) 右クリックメニュー（補助）

テキスト選択後に右クリック:
- 「このブロックを Context に追加」
- 「選択範囲のブロックを追加」（範囲に含まれるブロックを推定）

### Context Tray

選択されたブロックの管理 UI:

```typescript
interface ContextTrayState {
  blocks: SelectedBlock[];
  renderMode: 'preview' | 'errorOnly' | 'full';
  maxTokens: number;
}

interface SelectedBlock {
  blockId: string;
  seq: number;
  command: string;
  status: 'success' | 'error' | 'running';
  exitCode?: number;
  preview: string;         // 短縮版
  fullAvailable: boolean;  // リングで消えてないか
  pinned: boolean;
}
```

### AI リクエスト形式

```typescript
interface AIChatRequest {
  threadId: string;
  question: string;
  context: {
    sessionId: string;
    blocks: string[];              // blockId の配列
    renderMode: 'preview' | 'errorOnly' | 'full';
    maxChars: number;              // トークン制限用
  };
}
```

サーバー側でブロック本文を取得し、LLM 用にレンダリング:

```
=== Block #11 (seq=11) ===
Command: npm build
CWD: /home/user/project
Exit: 1 (error)
Duration: 2.3s

--- stderr (last 80 lines) ---
ERROR in src/index.ts(12,5):
  Cannot find module './utils'

--- stdout (last 20 lines) ---
> project@1.0.0 build
> tsc
```

### AI レスポンス形式

```typescript
interface AIChatResponse {
  messageId: string;
  content: string;
  citations: Citation[];      // 根拠ブロック
  suggestedCommands: SuggestedCommand[];
}

interface Citation {
  blockId: string;
  seq: number;
  reason: string;            // "このエラーメッセージから判断"
}

interface SuggestedCommand {
  command: string;
  description: string;
  risk: 'safe' | 'moderate' | 'dangerous';
}
```

### 引用スナップショット

AI Run 作成時に引用内容を保存（後で根拠が消えない）:

```typescript
interface AIRun {
  id: string;
  threadId: string;
  createdAt: string;
  request: AIChatRequest;
  contextSnapshot: {
    blocks: BlockSnapshot[];   // 実際のブロック内容
    totalChars: number;
  };
  response: AIChatResponse;
}
```

### uiRange（xterm 行範囲対応）

ブロックが xterm 上のどの行に対応するかを追跡:

```typescript
interface BlockUIRange {
  blockId: string;
  startRow: number;          // xterm バッファ内の開始行
  endRow?: number;           // 完了時に設定
  estimatedHeight: number;   // 概算行数（折り返しで変動）
}
```

MVP では「ブロック開始行にだけクリックターゲットを置く」で回避。
精度を上げる場合は右クリックメニューで補完。

## Consequences

### Positive

- **安定性**: テキスト選択ではなくブロック選択が主
- **可視性**: Context Tray で何を引用しているか明確
- **追跡可能**: 引用スナップショットで根拠が消えない
- **拡張性**: suggestedCommands で次アクションを提案

### Negative

- **UI 複雑度**: 分割 UI、オーバーレイ、Context Tray
- **状態管理**: ブロック選択状態の同期
- **パフォーマンス**: 大量ブロックのレンダリング

### 制限事項

- テキスト選択による「部分引用」は補助的
- xterm 行範囲の完全一致は保証しない（折り返しで変動）
- リングバッファで消えたブロックはプレビューのみ

## Implementation Plan

### Phase 1: 分割 UI 基盤

1. React + react-resizable-panels で分割レイアウト
2. 左: 既存 xterm.js を統合
3. 右: Context Tray + Chat プレースホルダー

### Phase 2: ブロック選択

1. BlockOverlay コンポーネント（ガター描画）
2. BlockSelectionManager（選択状態管理）
3. Context Tray 連携

### Phase 3: AI チャット

1. ChatThread + ChatInput
2. /api/chat エンドポイント
3. Citation 表示（クリックでブロックへジャンプ）

### Phase 4: 強化

1. SuggestedActions
2. 引用スナップショット保存
3. エラーフォーカスモード

## References

- [ADR 039: Command Block API Architecture](./039-command-block-api-architecture.md)
- [ADR 044: Warp-Style Block UI](./044-warp-style-block-ui.md)
- [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels)
- [Warp Terminal AI Features](https://docs.warp.dev/features/warp-ai)
