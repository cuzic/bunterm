# ADR 047: Quote to Clipboard Modal

## ステータス

採用

## コンテキスト

別の AI（ChatGPT、Gemini など）に質問する際、現在のコンテキストを効率的に共有する必要がある。Claude Code のやりとり、プロジェクトの Markdown ファイル、プランファイル、Git の変更内容など、複数のソースから必要な情報を選択してコピーできる機能が求められた。

## 決定

ツールバーに「Quote」ボタンを追加し、モーダルダイアログで以下の4種類のコンテンツを選択・コピーできる機能を実装する。

### コンテンツソース

1. **Claude Turns**: `~/.claude/projects/[project-slug]/*.jsonl` から最近の会話
2. **Project Markdown**: プロジェクトディレクトリ内の `*.md` ファイル
3. **Plans**: `~/.claude/plans/*.md` のプランファイル
4. **Git Diff**: `git diff` の変更内容（全体または個別ファイル）

### API エンドポイント

```
GET /api/claude-quotes/sessions       - Claude セッション一覧（history.jsonl から）
GET /api/claude-quotes/recent         - 指定セッションのターン一覧
GET /api/claude-quotes/turn/:uuid     - 特定ターンの全文取得
GET /api/claude-quotes/project-markdown - プロジェクト内 *.md 一覧
GET /api/claude-quotes/plans          - プランファイル一覧
GET /api/claude-quotes/file-content   - ファイル内容取得
GET /api/claude-quotes/git-diff       - Git 変更ファイル一覧
GET /api/claude-quotes/git-diff-file  - 特定ファイルの diff
```

### セッション特定方式

当初は URL パスからプロジェクト名を推測して slug を生成する方式だったが、不正確だったため `~/.claude/history.jsonl` を参照する方式に変更。

```typescript
interface ClaudeSessionInfo {
  sessionId: string;      // セッション UUID
  projectPath: string;    // 例: "/home/user/project"
  projectName: string;    // 例: "project"
  lastMessage: string;    // 最後のメッセージ（プレビュー用）
  lastTimestamp: number;  // 最終更新タイムスタンプ
}
```

`history.jsonl` には以下の情報が含まれる：
- `sessionId`: セッション UUID
- `projectPath`: プロジェクトの絶対パス
- `timestamp`: 最終更新時刻

これにより、slug を推測することなく正確にセッションファイルを特定できる。

### JSONL パース処理

Claude Code の JSONL ファイル構造：
- `type: 'user'` + `message.content` が文字列 → ユーザーの質問
- `type: 'user'` + `message.content` が配列 → ツール結果（スキップ）
- `type: 'assistant'` + `message.content` が配列 → アシスタントの応答

```typescript
// アシスタントの応答構造
interface AssistantMessage {
  role: 'assistant';
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; name: string; input: object }
  >;
}
```

### UI 構造

```
+--------------------------------------------------+
|  Quote to Clipboard                          [X] |
+--------------------------------------------------+
|  [Claude Turns] [Project *.md] [Plans] [Git Diff]|
+--------------------------------------------------+
|  Session: [プロジェクト名 (2h ago) ▼]            |
+--------------------------------------------------+
|  [] Select All                      [Clear]      |
+--------------------------------------------------+
|  [] "How do I implement..."           10分前     |
|     Asst: To implement feature X...              |
|                                                  |
|  [] "Fix the bug in..."               1時間前    |
|     Asst: I'll fix the bug by...                 |
+--------------------------------------------------+
|  3 items selected (~2,500 tokens)                |
|                              [Copy to Clipboard] |
+--------------------------------------------------+
```

### ホバーツールチップ

リスト項目にマウスを乗せると、500文字までのプレビューを表示。リスト表示は100文字に truncate し、詳細はツールチップで確認できる。

### コピー形式

Markdown 形式でクリップボードにコピー：

```markdown
## Claude Code Conversation

### User (2024-01-15 10:30:45)
How do I implement feature X?

### Assistant
To implement feature X, you need to...

[Used tools: Edit (src/component.ts)]

---
```

## 実装

### フロントエンド

- `QuoteManager.ts`: モーダル管理、データ取得、選択状態管理
- `styles.ts`: モーダル・タブ・リストの CSS
- `template.ts`: モーダルの HTML 構造
- `index.ts`: QuoteManager の初期化・バインド

### バックエンド

- `http-handler.ts`: 8つの API エンドポイント追加
  - `history.jsonl` 読み込み
  - セッションファイル（`*.jsonl`）パース
  - ファイルシステム操作（Markdown、Plans）
  - Git コマンド実行（diff）

## 制限値

| 項目 | 値 |
|------|-----|
| 最大表示セッション数 | 10 |
| 最大表示ターン数 | 20 |
| 最大表示 Project *.md | 10 |
| 最大表示 Plans | 10 |
| 最大表示 Git Diff ファイル | 50 |
| ユーザーメッセージ | 500文字（API）、100文字（リスト表示） |
| アシスタントサマリー | 500文字（API）、100文字（リスト表示） |
| ファイル内容（コピー時） | 最初の200行 |
| Git Diff 全体（コピー時） | 最大 50KB |

## 結果

### 利点

- 別の AI への質問時にコンテキストを素早く共有できる
- 複数ソースから必要な情報だけを選択できる
- トークン数の見積もりで API コストを意識できる
- ホバーでプレビュー確認してから選択できる

### 欠点

- `history.jsonl` / セッションファイルの形式変更に依存
- Git diff は同期的に実行されるため大規模リポジトリでは遅い可能性

## 関連 ADR

- [ADR 045: AI Chat Block Context](./045-ai-chat-block-context.md) - AI チャット機能
- [ADR 038: Native Terminal Bun](./038-native-terminal-bun.md) - ネイティブターミナル実装
