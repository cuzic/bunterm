# ADR 007: Test Isolation Strategy

## Status

Accepted

## Context

テストを個別に実行すると成功するが、`bun test src/` で全テストを実行すると失敗するという問題が発生した。

具体的な症状:
- `allocatePort` テストが 7602 を期待するところ 7601 を返す
- 各テストファイルが独自の状態管理をしており、モジュールキャッシュを通じて干渉

原因の分析:
1. `state.ts` がハードコードされたパス (`~/.local/state/ttyd-mux`) を使用
2. 各テストファイルが `mock.module()` で state.js をモックしようとするが、ES モジュールキャッシュにより他のテストに影響
3. `session-resolver.test.ts` の `mock.module('../config/state.js', ...)` がグローバルに state.js を置換

## Decision

### 1. 環境変数による状態ディレクトリの設定

**決定**: `TTYD_MUX_STATE_DIR` 環境変数で状態ディレクトリを上書き可能にする

```typescript
// src/config/state.ts
function getStateDirPath(): string {
  return process.env['TTYD_MUX_STATE_DIR'] ??
    join(homedir(), '.local', 'state', 'ttyd-mux');
}
```

**理由**:
- モックを使わず実際のファイルシステムでテスト
- 本番コードへの影響が最小限
- CI/CD 環境でも柔軟に設定可能

### 2. 共有テストセットアップモジュール

**決定**: `src/test-setup.ts` を作成し、全テストファイルで最初にインポート

```typescript
// src/test-setup.ts
export const TEST_STATE_DIR = `/tmp/ttyd-mux-test-${process.pid}`;
process.env['TTYD_MUX_STATE_DIR'] = TEST_STATE_DIR;

export function resetTestState(): void {
  // ディレクトリを削除して再作成
}

export function cleanupTestState(): void {
  // ディレクトリを削除
}
```

**使用パターン**:
```typescript
// 各テストファイルの先頭
import { cleanupTestState, resetTestState } from '../test-setup.js';

describe('...', () => {
  beforeEach(() => resetTestState());
  afterAll(() => cleanupTestState());
});
```

**重要**: `test-setup.ts` は他のモジュールより先にインポートする必要がある

### 3. afterAll でのクリーンアップ（afterEach ではない）

**決定**: `cleanupTestState()` は `afterAll` で呼び出す

**理由**:
- `beforeEach` の `resetTestState()` が既にディレクトリを削除・再作成
- `afterEach` でのクリーンアップは冗長（次の `beforeEach` で再度削除される）
- `afterAll` は全テスト完了後の最終クリーンアップに使用

### 4. mock.module() の廃止

**決定**: `session-resolver.test.ts` から `mock.module()` を削除し、実際の state.js を使用

**理由**:
- `mock.module()` は ES モジュールキャッシュに影響し、他のテストファイルに干渉
- 環境変数方式なら同じ state.js を全テストで安全に共有できる

## Consequences

### Positive

- 全 132 テストが一貫して成功
- テスト実行順序に依存しない
- 各テストが独立した状態で開始
- `mock.module()` の複雑さを排除

### Negative

- テストファイルは必ず `test-setup.ts` を最初にインポートする規約が必要
- `/tmp` にテストディレクトリが作成される（`afterAll` でクリーンアップ）

### Risks

- 新しいテストファイルを追加する際、`test-setup.ts` のインポートを忘れる可能性
  - → CLAUDE.md やテストテンプレートで規約を明記

## References

- Bun test documentation: https://bun.sh/docs/cli/test
- ES Modules caching behavior
