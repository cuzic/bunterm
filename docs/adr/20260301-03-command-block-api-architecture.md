# ADR 039: Command Block API アーキテクチャ

## Status

Accepted

## Context

エージェント（AI アシスタント等）がプログラマティックにターミナルコマンドを実行し、その結果を構造化されたデータとして取得・共有できる仕組みが必要になった。

### 要件

1. **コマンド実行**: JSON API 経由でコマンドを送信し、結果を取得
2. **出力ストリーミング**: リアルタイムで stdout/stderr を受信
3. **実行環境制御**: cwd、環境変数、タイムアウトを指定可能
4. **結果の永続化**: 過去のコマンド結果を照会可能
5. **メタデータ追跡**: エージェント ID、タグ、Git 情報などを記録

### 設計上の課題

1. **OSC 633 の信頼性**: シェル統合は環境依存で失敗率が高い
2. **ブロック純度**: 常駐シェルでは複数コマンドの出力が混在しうる
3. **環境の再現性**: リクエスト時と実行時で環境がズレる可能性
4. **大容量出力**: ビルドログ等で数 MB の出力が発生

## Decision

**Dual Execution Mode アーキテクチャ**を採用する。

### Ephemeral モード（デフォルト）

各コマンドを独立したプロセス (`bash -lc`) で実行：

```typescript
const proc = Bun.spawn(['bash', '-lc', command], {
  cwd: request.cwd,
  env: { ...process.env, ...request.env }
});
```

**特徴**：
- stdout/stderr が明確に分離
- 環境がリクエスト通りに再現
- OSC 633 不要（マーカー検出なし）
- 状態（cd 等）は引き継がない

### Persistent モード

常駐シェル + OSC 633 で実行：

```typescript
session.write(`${command}\n`);
// OSC 633;D でコマンド完了を検出
```

**特徴**：
- cd, export した状態が維持される
- OSC 633 セルフテストで信頼性確認
- 汚染セッション検出

### コンポーネント構成

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CommandExecutorManager                           │
├─────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────┐    ┌────────────────────────┐          │
│  │ EphemeralExecutor      │    │ PersistentExecutor     │          │
│  │ - bash -lc per command │    │ - OSC 633 tracking     │          │
│  │ - Process group mgmt   │    │ - Command queue        │          │
│  │ - Git info capture     │    │ - Contamination detect │          │
│  └────────────────────────┘    └────────────────────────┘          │
├─────────────────────────────────────────────────────────────────────┤
│                         BlockStore                                   │
│  - Metadata + Chunk separation                                       │
│  - Retention policy (ring buffer, failed preservation)              │
│  - Output redaction                                                  │
├─────────────────────────────────────────────────────────────────────┤
│                      BlockEventEmitter                               │
│  - SSE streaming with seq                                           │
│  - Last-Event-ID resumption                                         │
└─────────────────────────────────────────────────────────────────────┘
```

### データモデル

```typescript
interface ExtendedBlock {
  // 識別
  id: string;
  correlationId?: string;

  // コマンド情報
  command: string;
  mode: 'ephemeral' | 'persistent';
  submittedVia: 'api' | 'interactive';

  // 環境（再現性）
  requestedCwd?: string;
  requestedEnv?: Record<string, string>;
  effectiveCwd?: string;
  gitInfo?: GitInfo;

  // 出力（preview のみ、本体は chunk）
  stdoutPreview: string;
  stderrPreview: string;
  stdoutBytes: number;
  stderrBytes: number;
  truncated: boolean;

  // 状態
  status: 'queued' | 'running' | 'success' | 'error' | 'timeout' | 'canceled';
  exitCode?: number;
  errorType?: 'nonzero' | 'timeout' | 'canceled' | 'marker_missing';

  // 時間
  startedAt: string;
  endedAt?: string;
  durationMs?: number;

  // メタデータ
  tags?: string[];
  agentMeta?: AgentMeta;
  pinned: boolean;
}
```

### REST API

| エンドポイント | メソッド | 説明 |
|---------------|---------|------|
| `/api/sessions/:name/commands` | POST | コマンド実行 |
| `/api/sessions/:name/blocks` | GET | セッションのブロック一覧 |
| `/api/sessions/:name/integration` | GET | OSC 633 統合状態 |
| `/api/blocks/:id` | GET | ブロック詳細 |
| `/api/blocks/:id/cancel` | POST | コマンドキャンセル |
| `/api/blocks/:id/pin` | POST/DELETE | ブロックのピン留め |
| `/api/blocks/:id/chunks` | GET | 出力チャンク取得 |
| `/api/blocks/:id/stream` | GET | SSE ストリーミング |

## Consequences

### Positive

- **信頼性**: Ephemeral モードで OSC 633 に依存しない実行が可能
- **柔軟性**: 用途に応じてモードを選択可能
- **追跡可能性**: 全コマンドの実行履歴を構造化データで保持
- **再開可能**: SSE の Last-Event-ID で切断から復帰

### Negative

- **Ephemeral のオーバーヘッド**: コマンドごとにプロセス生成
- **Persistent の制約**: OSC 633 対応シェルが必要
- **複雑性**: 2 つの実行モードを維持

### 選択しなかった代替案

1. **OSC 633 のみ**: 環境依存が高すぎる
2. **Ephemeral のみ**: cd/export の状態維持ができない
3. **外部ツール（script コマンド等）**: 移植性の問題

## Implementation Details

### ファイル構成

```
src/daemon/native-terminal/
├── types.ts                    # ExtendedBlock, CommandRequest 型
├── ephemeral-executor.ts       # Ephemeral モード実行
├── persistent-executor.ts      # Persistent モード実行
├── command-executor-manager.ts # 統合コーディネータ
├── block-store.ts              # ブロック永続化
├── block-event-emitter.ts      # SSE イベント管理
├── output-redactor.ts          # 秘密情報マスキング
└── http-handler.ts             # REST API エンドポイント
```

## References

- [ADR 038: Bun.Terminal ベースのネイティブターミナル実装](./038-native-terminal-bun.md)
- [OSC 633 Shell Integration](https://code.visualstudio.com/docs/terminal/shell-integration)
