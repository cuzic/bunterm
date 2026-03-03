# Claude Code セッション監視機能 設計書

## 1. 概要

Claude Code の会話履歴をリアルタイムで監視し、ブロック UI として表示する機能。

### 目的
- Claude Code とのやりとりをブロックとして可視化
- AI Chat との統合（コンテキストとして利用可能に）
- ツール呼び出しの結果を構造化表示

### スコープ
- native-terminal モードでのみ動作
- セッションの作業ディレクトリに対応する Claude Code プロジェクトを監視

---

## 2. アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Server (Bun)                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────┐    ┌──────────────────────────────────────┐  │
│  │ TerminalSession  │    │ ClaudeSessionWatcher                 │  │
│  │                  │    │                                      │  │
│  │ - cwd            │───▶│ - projectPath (derived from cwd)     │  │
│  │                  │    │ - activeSessionId                    │  │
│  └──────────────────┘    │ - fs.watch on history.jsonl          │  │
│                          │ - fs.watch on {sessionId}.jsonl      │  │
│                          │                                      │  │
│                          │ Events:                              │  │
│                          │  - 'message' (user/assistant)        │  │
│                          │  - 'toolUse' (Bash, Read, Edit...)   │  │
│                          │  - 'sessionChange' (new session)     │  │
│                          └──────────────┬───────────────────────┘  │
│                                         │                           │
│                                         ▼                           │
│                          ┌──────────────────────────────────────┐  │
│                          │ WebSocket Handler                    │  │
│                          │                                      │  │
│                          │ Server → Client Messages:            │  │
│                          │  - claudeUserMessage                 │  │
│                          │  - claudeAssistantMessage            │  │
│                          │  - claudeToolUse                     │  │
│                          │  - claudeToolResult                  │  │
│                          │  - claudeSessionStart                │  │
│                          └──────────────┬───────────────────────┘  │
│                                         │                           │
└─────────────────────────────────────────┼───────────────────────────┘
                                          │ WebSocket
                                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Client (Browser)                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ ClaudeBlockManager                                            │  │
│  │                                                               │  │
│  │ - blocks: ClaudeBlock[]                                       │  │
│  │ - handleClaudeMessage(msg)                                    │  │
│  │ - groupByConversationTurn()                                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                          │                                          │
│                          ▼                                          │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ ClaudeBlockRenderer                                           │  │
│  │                                                               │  │
│  │ - Conversation turn view                                      │  │
│  │ - Tool call accordion                                         │  │
│  │ - Thinking toggle (expandable)                                │  │
│  │ - Copy/Send to AI Chat actions                                │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. ファイル構成

```
src/daemon/native-terminal/
├── claude-watcher/
│   ├── index.ts              # エクスポート
│   ├── types.ts              # 型定義
│   ├── session-watcher.ts    # ClaudeSessionWatcher クラス
│   ├── history-watcher.ts    # history.jsonl 監視
│   ├── message-parser.ts     # JSONL パーサー
│   └── path-utils.ts         # パス変換ユーティリティ
├── client/
│   ├── ClaudeBlockManager.ts # クライアント側ブロック管理
│   └── ClaudeBlockRenderer.ts # UI レンダリング
└── types.ts                  # 既存 + Claude メッセージ型追加
```

---

## 4. 型定義

### 4.1 Claude Code セッションファイル形式（入力）

```typescript
/** history.jsonl の1行 */
interface ClaudeHistoryEntry {
  display: string;
  pastedContents: Record<string, string>;
  timestamp: number;
  project: string;        // e.g., "/home/cuzic/ttyd-mux"
  sessionId?: string;     // e.g., "4385c594-2e1f-4350-aef7-96ba9d44ba54"
}

/** {sessionId}.jsonl の1行 */
interface ClaudeSessionEntry {
  type: 'user' | 'assistant';
  message: ClaudeMessageContent;
  uuid: string;
  parentUuid: string | null;
  timestamp: string;       // ISO 8601
  sessionId: string;
  cwd: string;
  isMeta?: boolean;
  isSidechain?: boolean;
}

/** ユーザーメッセージ */
interface ClaudeUserMessage {
  role: 'user';
  content: string;
}

/** アシスタントメッセージ（配列） */
type ClaudeAssistantMessage = ClaudeContentBlock[];

type ClaudeContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string; signature: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

type ClaudeMessageContent = ClaudeUserMessage | ClaudeAssistantMessage;
```

### 4.2 WebSocket メッセージ（出力）

```typescript
// === Server → Client Messages ===

/** Claude ユーザーメッセージ */
interface ClaudeUserMessageWS {
  type: 'claudeUserMessage';
  uuid: string;
  content: string;
  timestamp: string;
  sessionId: string;
}

/** Claude アシスタントテキスト */
interface ClaudeAssistantTextWS {
  type: 'claudeAssistantText';
  uuid: string;
  text: string;
  timestamp: string;
}

/** Claude 思考プロセス */
interface ClaudeThinkingWS {
  type: 'claudeThinking';
  uuid: string;
  thinking: string;
  timestamp: string;
}

/** Claude ツール呼び出し */
interface ClaudeToolUseWS {
  type: 'claudeToolUse';
  uuid: string;
  toolId: string;
  toolName: string;        // 'Bash' | 'Read' | 'Edit' | 'Write' | 'Glob' | 'Grep' | ...
  input: Record<string, unknown>;
  timestamp: string;
}

/** Claude ツール結果 */
interface ClaudeToolResultWS {
  type: 'claudeToolResult';
  uuid: string;
  toolId: string;
  content: string;
  timestamp: string;
}

/** Claude セッション開始 */
interface ClaudeSessionStartWS {
  type: 'claudeSessionStart';
  sessionId: string;
  project: string;
  timestamp: string;
}

/** Claude セッション終了 */
interface ClaudeSessionEndWS {
  type: 'claudeSessionEnd';
  sessionId: string;
  timestamp: string;
}

type ClaudeWatcherMessage =
  | ClaudeUserMessageWS
  | ClaudeAssistantTextWS
  | ClaudeThinkingWS
  | ClaudeToolUseWS
  | ClaudeToolResultWS
  | ClaudeSessionStartWS
  | ClaudeSessionEndWS;
```

---

## 5. コンポーネント設計

### 5.1 ClaudeSessionWatcher

```typescript
import { watch, type FSWatcher } from 'node:fs';
import { EventEmitter } from 'node:events';

interface ClaudeSessionWatcherOptions {
  /** ターミナルセッションの作業ディレクトリ */
  cwd: string;
  /** Claude 設定ディレクトリ (default: ~/.claude) */
  claudeDir?: string;
}

interface ClaudeSessionWatcherEvents {
  message: (msg: ClaudeWatcherMessage) => void;
  error: (err: Error) => void;
}

class ClaudeSessionWatcher extends EventEmitter {
  private cwd: string;
  private claudeDir: string;
  private projectPath: string;           // e.g., "-home-cuzic-ttyd-mux"
  private activeSessionId: string | null = null;

  private historyWatcher: FSWatcher | null = null;
  private sessionWatcher: FSWatcher | null = null;
  private historyPosition = 0;           // history.jsonl の読み取り位置
  private sessionPosition = 0;           // {sessionId}.jsonl の読み取り位置

  constructor(options: ClaudeSessionWatcherOptions);

  /** 監視開始 */
  start(): Promise<void>;

  /** 監視停止 */
  stop(): void;

  /** 現在のセッション ID */
  get sessionId(): string | null;

  // Private methods
  private deriveProjectPath(cwd: string): string;
  private watchHistory(): void;
  private watchSession(sessionId: string): void;
  private readNewHistoryLines(): Promise<void>;
  private readNewSessionLines(): Promise<void>;
  private parseSessionEntry(line: string): ClaudeWatcherMessage[];
}
```

### 5.2 パス変換ロジック

```typescript
// path-utils.ts

/**
 * 作業ディレクトリから Claude プロジェクトパスを導出
 * @example "/home/cuzic/ttyd-mux" → "-home-cuzic-ttyd-mux"
 */
export function cwdToProjectPath(cwd: string): string {
  return cwd.replace(/\//g, '-');
}

/**
 * Claude プロジェクトディレクトリのフルパスを取得
 * @example "-home-cuzic-ttyd-mux" → "/home/cuzic/.claude/projects/-home-cuzic-ttyd-mux"
 */
export function getProjectDir(projectPath: string, claudeDir: string): string {
  return `${claudeDir}/projects/${projectPath}`;
}

/**
 * セッションファイルのパスを取得
 */
export function getSessionFilePath(
  projectPath: string,
  sessionId: string,
  claudeDir: string
): string {
  return `${claudeDir}/projects/${projectPath}/${sessionId}.jsonl`;
}
```

### 5.3 TerminalSession との統合

```typescript
// terminal-session.ts に追加

class TerminalSession {
  private claudeWatcher: ClaudeSessionWatcher | null = null;

  constructor(options: TerminalSessionOptions) {
    // ... 既存の初期化 ...

    // Claude Watcher を初期化
    this.claudeWatcher = new ClaudeSessionWatcher({ cwd: options.cwd });
    this.claudeWatcher.on('message', (msg) => {
      this.broadcast(msg);  // 全クライアントに送信
    });
  }

  async start(): Promise<void> {
    // ... 既存の起動処理 ...

    // Claude Watcher を開始
    await this.claudeWatcher?.start();
  }

  stop(): void {
    // ... 既存の停止処理 ...

    this.claudeWatcher?.stop();
  }
}
```

---

## 6. データフロー

### 6.1 セッション検出フロー

```
1. TerminalSession 起動
   ↓
2. ClaudeSessionWatcher 初期化
   - cwd → projectPath 変換
   - ~/.claude/history.jsonl を監視開始
   ↓
3. history.jsonl 更新検出
   - 新しい行を読み取り
   - project が一致 && sessionId が存在する行を検出
   ↓
4. アクティブセッション切り替え
   - 古いセッションの監視を停止
   - 新しいセッション {sessionId}.jsonl を監視開始
   - 'claudeSessionStart' イベント発火
   ↓
5. セッションファイル監視
   - 新しい行を検出 → パース → イベント発火
```

### 6.2 メッセージパースフロー

```
{sessionId}.jsonl の新しい行
   ↓
type == 'user'?
   ├─ Yes → claudeUserMessage 発火
   └─ No (assistant) → message 配列をイテレート
                          ↓
                    content.type で分岐
                    ├─ 'text'      → claudeAssistantText
                    ├─ 'thinking'  → claudeThinking
                    ├─ 'tool_use'  → claudeToolUse
                    └─ 'tool_result' → claudeToolResult
```

---

## 7. クライアント側設計（Decoration API）

### 7.1 xterm.js Decoration API の活用

ターミナル画面内でブロックを視覚的に表示するため、xterm.js の Decoration API を使用。

```typescript
import type { IMarker, IDecoration, Terminal } from '@xterm/xterm';

interface BlockDecoration {
  blockId: string;
  marker: IMarker;
  statusDecoration: IDecoration;      // 左端のステータスアイコン
  headerDecoration: IDecoration;      // ヘッダー行の装飾
  actionDecoration?: IDecoration;     // 右端のアクションボタン
}

class DecorationManager {
  private terminal: Terminal;
  private decorations: Map<string, BlockDecoration> = new Map();

  constructor(terminal: Terminal) {
    this.terminal = terminal;
  }

  /**
   * ブロック開始時に Decoration を追加
   */
  addBlockDecoration(block: Block | ClaudeTurn): BlockDecoration {
    // 1. 行にマーカーを追加
    const marker = this.terminal.addMarker(block.startLine);
    if (!marker) throw new Error('Failed to add marker');

    // 2. 左端にステータスアイコン
    const statusDecoration = this.terminal.registerDecoration({
      marker,
      x: 0,
      width: 2,
      overviewRulerOptions: { color: this.getStatusColor(block.status) }
    });

    // 3. ステータスアイコンをレンダリング
    statusDecoration?.onRender((element) => {
      element.className = 'block-status-icon';
      element.innerHTML = this.getStatusIcon(block.status);
      element.style.backgroundColor = this.getStatusColor(block.status);
    });

    // 4. 右端にアクションボタン（ホバー時に表示）
    const actionDecoration = this.terminal.registerDecoration({
      marker,
      x: this.terminal.cols - 10,  // 右端から10セル
      width: 10
    });

    actionDecoration?.onRender((element) => {
      element.className = 'block-actions hidden';
      element.innerHTML = `
        <button class="block-action" data-action="rerun" title="Re-run">▶</button>
        <button class="block-action" data-action="copy" title="Copy">📋</button>
        <button class="block-action" data-action="ai" title="Send to AI">🤖</button>
      `;
    });

    const decoration: BlockDecoration = {
      blockId: block.id,
      marker,
      statusDecoration: statusDecoration!,
      headerDecoration: statusDecoration!, // 同じ行
      actionDecoration
    };

    this.decorations.set(block.id, decoration);
    return decoration;
  }

  /**
   * ブロック終了時にステータス更新
   */
  updateBlockStatus(blockId: string, status: BlockStatus): void {
    const decoration = this.decorations.get(blockId);
    if (!decoration) return;

    // ステータスアイコンを更新
    const element = decoration.statusDecoration.element;
    if (element) {
      element.innerHTML = this.getStatusIcon(status);
      element.style.backgroundColor = this.getStatusColor(status);
    }
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case 'success': return '✓';
      case 'error': return '✗';
      case 'running': return '▶';
      case 'streaming': return '◐';
      default: return '○';
    }
  }

  private getStatusColor(status: string): string {
    switch (status) {
      case 'success': return '#2e7d32';
      case 'error': return '#c62828';
      case 'running': return '#1565c0';
      case 'streaming': return '#7b1fa2';
      default: return '#616161';
    }
  }
}
```

### 7.2 画面表示イメージ

```
┌────────────────────────────────────────────────────────────────────────┐
│ Terminal (xterm.js with Decorations)                                   │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│ ✓│ $ ls -la                                              [▶][📋][🤖] │
│  │ total 64                                                            │
│  │ drwxr-xr-x  12 user user  4096 Mar  2 10:00 .                       │
│  │ -rw-r--r--   1 user user  1234 Mar  2 10:00 README.md               │
│  │                                                                      │
│──┼──────────────────────────────────────────────────────────────────────│
│ ✗│ $ npm run build                                       [▶][📋][🤖] │
│  │ Error: Module not found                                             │
│  │                                                                      │
│──┼──────────────────────────────────────────────────────────────────────│
│ 🔷│ 👤 claude code のやりとりをブロックとして...          [📋][➕][🔍] │ ← Claude Turn
│  │                                                                      │
│  │ 🤖 セッションファイルの監視機能を実装します。                       │
│  │                                                                      │
│  │ 🔧 Bash: ls -la ~/.claude/ ✓                                        │ ← Tool Call
│  │ 🔧 WebSearch: "Bun file watch API" ✓                                │
│  │                                                                      │
│──┼──────────────────────────────────────────────────────────────────────│
│ ◐│ 👤 Decoration API を使った実装にしましょう             [streaming] │ ← 進行中
│  │                                                                      │
│  │ 🤖 Decoration API を使った実装に設計を更新します...▌                │
│  │                                                                      │
└────────────────────────────────────────────────────────────────────────┘
```

### 7.3 ClaudeTurn 型

```typescript
/** Claude 会話ターン（1ターン = ユーザー入力 + AI応答） */
interface ClaudeTurn {
  id: string;                    // uuid of user message
  type: 'claude';                // ブロックタイプ識別
  userMessage: string;
  assistantText: string;
  thinking?: string;
  toolCalls: ClaudeToolCall[];
  timestamp: string;
  status: 'streaming' | 'complete';
  startLine: number;             // ターミナル上の開始行
  endLine?: number;              // 終了行（streaming 中は undefined）
}

interface ClaudeToolCall {
  id: string;
  name: string;                  // 'Bash' | 'Read' | 'Edit' | 'Write' | ...
  input: Record<string, unknown>;
  result?: string;
  status: 'pending' | 'complete' | 'error';
}
```

### 7.4 CSS スタイル

```css
/* ブロックステータスアイコン */
.block-status-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: white;
  border-radius: 2px;
  cursor: pointer;
}

/* ブロックアクションボタン */
.block-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.block-actions:hover,
.block-status-icon:hover + .block-actions {
  opacity: 1;
}

.block-action {
  background: rgba(0, 0, 0, 0.6);
  border: none;
  border-radius: 3px;
  padding: 2px 6px;
  cursor: pointer;
  font-size: 12px;
}

.block-action:hover {
  background: rgba(0, 0, 0, 0.8);
}

/* Claude ターン専用スタイル */
.claude-turn-icon {
  background: linear-gradient(135deg, #7c3aed, #a855f7);
}

/* Overview Ruler（スクロールバー横） */
.xterm-overview-ruler {
  width: 10px !important;
}
```

### 7.5 インタラクション

| アクション | 動作 |
|------------|------|
| ステータスアイコン クリック | ブロック選択（複数選択: Cmd/Ctrl+クリック） |
| ステータスアイコン ホバー | アクションボタン表示 |
| ▶ ボタン | コマンド再実行 / Claude に再送信 |
| 📋 ボタン | コマンド+出力をクリップボードにコピー |
| 🤖 ボタン | AI Chat にコンテキストとして追加 |
| Cmd/Ctrl+クリック | 複数ブロック選択 |
| Cmd/Ctrl+C | 選択ブロックをコピー |

---

## 8. エラーハンドリング

| エラー | 対処 |
|--------|------|
| history.jsonl が存在しない | 作成されるまで定期的にリトライ |
| プロジェクトディレクトリが存在しない | 警告ログ、監視スキップ |
| セッションファイルが消えた | sessionEnd イベント、監視停止 |
| JSON パースエラー | 該当行をスキップ、ログ出力 |
| fs.watch エラー | 再接続試行（exponential backoff） |

---

## 9. 設定

```yaml
# config.yaml
native_terminal:
  claude_watcher:
    enabled: true
    claude_dir: "~/.claude"          # Claude 設定ディレクトリ
    history_poll_interval: 1000      # history.jsonl ポーリング間隔 (ms)
    include_thinking: true           # thinking ブロックを含める
    max_tool_result_size: 10000      # tool_result の最大文字数（超過時は truncate）
```

---

## 10. 実装フェーズ

### Phase 1: 基盤実装（サーバー側）
1. `claude-watcher/types.ts` - 型定義
2. `claude-watcher/path-utils.ts` - パス変換
3. `claude-watcher/message-parser.ts` - JSONL パーサー
4. `claude-watcher/session-watcher.ts` - メイン監視クラス（fs.watch）

### Phase 2: WebSocket 統合
5. `types.ts` に Claude メッセージ型追加
6. `terminal-session.ts` に ClaudeSessionWatcher 統合
7. WebSocket でクライアントにブロードキャスト

### Phase 3: Decoration API 実装（クライアント側）
8. `DecorationManager.ts` - xterm.js Decoration 管理
   - addMarker / registerDecoration
   - ステータスアイコン、アクションボタン
9. `ClaudeBlockManager.ts` - Claude ターン管理
   - WebSocket メッセージ → ClaudeTurn 変換
   - ターンのグルーピング
10. `terminal-client.ts` に DecorationManager 統合

### Phase 4: スタイルとインタラクション
11. CSS スタイル追加（ステータスアイコン、アクションボタン）
12. クリック/ホバーイベントハンドラ
13. Overview Ruler 表示

### Phase 5: AI Chat 統合
14. 「Send to AI Chat」アクション実装
15. Claude ターンをコンテキストとして追加
16. ツール呼び出し結果の展開表示

### Phase 6: テストと最適化
17. ユニットテスト作成
18. パフォーマンス最適化（大量ブロック時）
19. ドキュメント更新

---

## 11. テスト計画

```typescript
// session-watcher.test.ts

describe('ClaudeSessionWatcher', () => {
  it('should derive correct project path from cwd', () => {
    expect(cwdToProjectPath('/home/cuzic/ttyd-mux'))
      .toBe('-home-cuzic-ttyd-mux');
  });

  it('should detect new session from history.jsonl', async () => {
    // テスト用の history.jsonl を作成
    // 新しい行を追加
    // sessionStart イベントを検証
  });

  it('should parse user message correctly', () => {
    const entry = { type: 'user', message: { role: 'user', content: 'Hello' } };
    const messages = parseSessionEntry(JSON.stringify(entry));
    expect(messages[0].type).toBe('claudeUserMessage');
  });

  it('should parse tool_use correctly', () => {
    const entry = {
      type: 'assistant',
      message: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }]
    };
    const messages = parseSessionEntry(JSON.stringify(entry));
    expect(messages[0].type).toBe('claudeToolUse');
  });
});
```
