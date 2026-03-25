# ADR 048: Claude Code Session Watcher

## ステータス

採用

## コンテキスト

Claude Code は会話履歴を `~/.claude/` ディレクトリに保存する。この情報を ttyd-mux から参照することで、以下の機能を実現できる：

1. **Quote to Clipboard**: 最近の会話を他の AI に引用
2. **Inline Blocks**: Claude のターンをターミナルブロックとして表示
3. **コンテキスト同期**: Claude の作業内容を AI チャットに自動連携

## 決定

Claude Code のセッションファイルをパース・監視するモジュールを実装する。

### ディレクトリ構造

```
~/.claude/
├── history.jsonl          # 全セッションの履歴インデックス
├── projects/
│   └── -home-user-project/ # プロジェクト slug（パスの / を - に置換）
│       ├── abc-123.jsonl   # セッションファイル（UUID）
│       └── def-456.jsonl
└── plans/
    └── *.md                # プランファイル
```

### パスユーティリティ

```typescript
// path-utils.ts
function cwdToProjectPath(cwd: string): string;
// "/home/user/project" → "-home-user-project"

function projectPathToCwd(projectPath: string): string;
// "-home-user-project" → "/home/user/project"

function getProjectDir(projectPath: string): string;
// → "~/.claude/projects/-home-user-project"

function getSessionFilePath(projectPath: string, sessionId: string): string;
// → "~/.claude/projects/-home-user-project/abc-123.jsonl"
```

### history.jsonl 形式

各行が JSON オブジェクト：

```json
{
  "sessionId": "abc-123-def-456",
  "projectPath": "/home/user/project",
  "timestamp": 1709300000000,
  "display": "最後のメッセージプレビュー..."
}
```

### セッションファイル形式 (*.jsonl)

各行が JSON オブジェクト、以下のタイプがある：

#### メタ情報
```json
{
  "isMeta": true,
  "sessionId": "abc-123",
  "version": "1.0"
}
```

#### ユーザーメッセージ（質問）
```json
{
  "type": "user",
  "uuid": "msg-001",
  "timestamp": "2024-03-01T10:00:00Z",
  "message": {
    "role": "user",
    "content": "この関数を実装して"
  }
}
```

#### ユーザーメッセージ（ツール結果）
```json
{
  "type": "user",
  "uuid": "msg-002",
  "timestamp": "2024-03-01T10:00:01Z",
  "message": {
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "tool_use_id": "tool-001",
        "content": "File content..."
      }
    ]
  }
}
```

#### アシスタントメッセージ
```json
{
  "type": "assistant",
  "uuid": "msg-003",
  "timestamp": "2024-03-01T10:00:02Z",
  "message": {
    "role": "assistant",
    "content": [
      { "type": "text", "text": "実装しました。" },
      {
        "type": "tool_use",
        "id": "tool-002",
        "name": "Edit",
        "input": { "file_path": "src/index.ts", "..." }
      }
    ]
  }
}
```

### メッセージパーサー

```typescript
// message-parser.ts
interface ClaudeTurn {
  uuid: string;
  userContent: string;      // ユーザーの質問
  assistantSummary: string; // アシスタントの応答（先頭500文字）
  timestamp: string;
  hasToolUse: boolean;
  editedFiles?: string[];   // Edit/Write で編集されたファイル
}

function parseSessionFile(content: string): ClaudeTurn[];
```

### ターン抽出ロジック

1. `type: 'user'` かつ `message.content` が**文字列**の場合 → 新しいターンの開始
2. `type: 'user'` かつ `message.content` が**配列**の場合 → ツール結果（スキップ）
3. `type: 'assistant'` の場合 → 応答を解析
   - `content[].type === 'text'` → 応答テキスト
   - `content[].type === 'tool_use'` → ツール使用フラグ、ファイル編集追跡

```typescript
// ターン抽出の疑似コード
for (const entry of entries) {
  if (entry.type === 'user' && typeof entry.message.content === 'string') {
    // 新しいターン開始
    currentUserContent = entry.message.content;
    currentUuid = entry.uuid;
  } else if (entry.type === 'assistant' && Array.isArray(entry.message.content)) {
    // アシスタント応答解析
    for (const block of entry.message.content) {
      if (block.type === 'text') {
        assistantSummary = block.text.slice(0, 500);
      }
      if (block.type === 'tool_use') {
        hasToolUse = true;
        if (block.name === 'Edit' || block.name === 'Write') {
          editedFiles.push(block.input.file_path);
        }
      }
    }
    // テキストがある場合のみターンとして記録
    if (assistantSummary) {
      turns.push({ uuid, userContent, assistantSummary, ... });
    }
  }
}
```

## 実装

### ファイル構成

```
src/daemon/native-terminal/claude-watcher/
├── index.ts           # エクスポート
├── types.ts           # 型定義
├── path-utils.ts      # パス変換ユーティリティ
└── message-parser.ts  # JSONL パーサー
```

### http-handler.ts での使用

```typescript
// セッション一覧取得
function getRecentClaudeSessions(limit: number): ClaudeSessionInfo[];

// ターン一覧取得
function getRecentClaudeTurnsFromSession(
  sessionId: string,
  projectPath: string,
  count: number
): ClaudeTurnSummary[];
```

## 結果

### 利点

- Claude Code の会話履歴にプログラムからアクセス可能
- セッション特定が正確（history.jsonl による）
- 複数機能（Quote、InlineBlocks）で再利用可能

### 欠点

- Claude Code のファイル形式に依存（形式変更で動作しなくなる）
- ファイル監視（watch）は未実装（現在はオンデマンド読み込み）

### 将来の拡張

- chokidar によるファイル監視で自動更新
- InlineBlocks 機能でのリアルタイム同期

## 関連 ADR

- [ADR 047: Quote to Clipboard](./047-quote-to-clipboard.md) - このパーサーを使用
- [ADR 045: AI Chat Block Context](./045-ai-chat-block-context.md) - InlineBlocks 拡張で使用予定
