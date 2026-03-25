# ADR 009: Dependency Injection for Testability

## Status

Accepted

## Context

ADR 008 で Feature Test パターンを導入し、カバレッジを 77% まで向上させた。しかし、さらなる向上には以下の課題があった:

1. **外部依存の問題**: `session-manager.ts` は `child_process.spawn`、`process.kill`、tmux コマンドなど外部リソースに直接依存
2. **状態管理の問題**: `state.ts` はファイルシステムに直接アクセスするため、テスト間で状態が共有される
3. **ソケット通信の問題**: `client/index.ts` は Unix ソケットに直接接続するため、デーモンなしではテスト不可

Feature Test だけでは外部プロセスやソケット通信のモック化が困難で、`session-manager.ts` の `startSession` など主要ロジックのテストができなかった。

## Decision

**Dependency Injection (DI) パターン**を採用し、外部依存を抽象化するインターフェースを導入する。

### 新規インターフェース

| インターフェース | ファイル | 責務 |
|------------------|----------|------|
| `ProcessRunner` | `src/utils/process-runner.ts` | プロセス生成・終了・存在確認 |
| `SocketClient` | `src/utils/socket-client.ts` | Unix ソケット接続・存在確認 |
| `TmuxClient` | `src/utils/tmux-client.ts` | tmux コマンド実行 |
| `StateStore` | `src/config/state-store.ts` | 状態の読み書き |

### 設計原則

1. **後方互換性**: 既存の関数エクスポートは維持し、内部で default 実装を使用
2. **ファクトリ関数**: 各インターフェースに `createMock*` 関数を提供
3. **コンストラクタ DI**: クラス（SessionManager）はコンストラクタで依存を受け取る
4. **モジュール DI**: 関数ベースのモジュール（client）は `setDeps`/`resetDeps` パターンを使用

### 実装例

```typescript
// ProcessRunner インターフェース
export interface ProcessRunner {
  spawn(command: string, args: string[], options?: SpawnOptions): ChildProcess;
  execSync(command: string, options?: ExecSyncOptions): string;
  isProcessRunning(pid: number): boolean;
  kill(pid: number, signal?: NodeJS.Signals | number): void;
}

// デフォルト実装
export const defaultProcessRunner: ProcessRunner = {
  spawn: (cmd, args, opts) => spawn(cmd, args, opts ?? {}),
  // ...
};

// モック作成
export function createMockProcessRunner(overrides?: Partial<ProcessRunner>): ProcessRunner;
```

```typescript
// SessionManager での使用
export class SessionManager extends EventEmitter {
  constructor(deps: SessionManagerDeps = defaultSessionManagerDeps) {
    this.deps = deps;
  }

  startSession(options: StartSessionOptions): SessionState {
    const { stateStore, processRunner, tmuxClient } = this.deps;
    // 依存を通じて操作
  }
}

// テストでの使用
const manager = createSessionManager({
  stateStore: createInMemoryStateStore(),
  processRunner: createMockProcessRunner({ spawn: () => mockProcess }),
  tmuxClient: createMockTmuxClient()
});
```

## Consequences

### Positive

- **テスト容易性**: 外部依存なしで SessionManager の全ロジックをテスト可能に
- **カバレッジ向上**: 77% → 81% に改善（ADR 008 の Feature Test と合わせて 57% → 81%）
- **テスト速度**: ファイル I/O やプロセス生成なしで高速実行
- **明示的な依存**: コードから依存関係が明確に読み取れる

### Negative

- **コード量増加**: インターフェース定義とファクトリ関数の追加
- **間接層の追加**: 実装を追うために1層余分にジャンプが必要
- **学習コスト**: DI パターンの理解が必要

### 新規テストファイル

| ファイル | テスト数 | 対象 |
|----------|----------|------|
| `state-store.test.ts` | 23 | createInMemoryStateStore の全メソッド |
| `tmux-client.test.ts` | 14 | TmuxClient + ProcessRunner モック |
| `session-manager.di.test.ts` | 13 | SessionManager の DI テスト |

### カバレッジ改善

| ファイル | Before (ADR 008後) | After |
|----------|-------------------|-------|
| state-store.ts | 2% | 100% |
| tmux-client.ts | 72% | 100% |
| session-manager.ts | 40% | 95% |
| **全体** | 77% | 81% |

## Notes

- インテグレーションテストが必要なコード（WebSocket プロキシ、TTY 操作）は DI の対象外
- 将来的に、server.ts の HTTP ハンドラも同様のパターンで抽象化可能
