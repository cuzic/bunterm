# ADR 008: Feature Test Pattern

## Status

Accepted

## Context

テストカバレッジを向上させる際、以下の選択肢があった:

1. **Unit Test**: 関数単位でモックを使ってテスト
2. **E2E Test**: Playwright 等で実際のブラウザ操作をテスト
3. **Feature Test**: 実サーバー or モックサーバーを使った統合テスト

Unit Test だけではカバレッジに限界があり（57%）、E2E Test は環境構築が複雑でCI での実行が困難だった。

## Decision

**Feature Test パターン**を採用し、以下の2つのアプローチを使い分ける:

### 1. Real Server Testing（server.feature.test.ts）

実際のサーバーインスタンスを起動してテスト:

```typescript
import { createDaemonServer } from './server.js';

beforeAll(() => {
  server = createDaemonServer(testConfig);
  return new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      serverPort = address.port;
      resolve();
    });
  });
});

test('GET /ttyd-mux/ returns HTML portal', async () => {
  const response = await fetch(`http://127.0.0.1:${serverPort}/ttyd-mux/`);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/html');
});
```

**用途**: サーバー側のロジック（ルーティング、レスポンス生成）のテスト

### 2. Mock Server Testing（client.feature.test.ts）

Bun.serve でモックサーバーを作成してクライアントをテスト:

```typescript
beforeAll(() => {
  mockServer = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === '/ttyd-mux/api/status') {
        return Response.json(mockStatus);
      }
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
  });

  // クライアントがモックサーバーを使うように設定
  setDaemonState({ pid: 1234, port: mockServer.port, started_at: '...' });
});

test('getStatus returns status response', async () => {
  const status = await getStatus(testConfig);
  expect(status.daemon?.pid).toBe(1234);
});
```

**用途**: クライアント側のロジック（リクエスト構築、レスポンス解析）のテスト

### 使い分けの基準

| テスト対象 | 手法 | 理由 |
|------------|------|------|
| HTTP サーバー | Real Server | 実際のルーティングとレスポンスを検証 |
| HTTP クライアント | Mock Server | 外部依存なしでクライアントロジックを検証 |
| ビジネスロジック | Unit Test | 高速、依存なし |
| WebSocket/Proxy | E2E or 手動 | 複雑な相互作用が必要 |

## Consequences

### Positive

- **カバレッジ向上**: 57% → 77%（20% 向上）
- **CI 実行可能**: 外部依存なし、高速
- **リアルな検証**: 実サーバーを使うためルーティングバグを検出可能
- **保守性**: テストコードが実際の使用方法に近い

### Negative

- **ポート競合リスク**: `port: 0` で回避可能だが注意が必要
- **状態管理**: テスト間で状態をリセットする必要あり（test-setup.ts で対応）
- **テスト速度**: Unit Test より若干遅い（全体で +100ms 程度）

### カバレッジ改善

| ファイル | Before | After |
|----------|--------|-------|
| server.ts | 10% | 46% |
| client/index.ts | 12% | 34% |
| session-manager.ts | 23% | 40% |
| **全体** | 57% | 77% |

## Notes

- Feature Test は `*.feature.test.ts` という命名規則を使用
- `port: 0` を使用して OS に空きポートを割り当てさせる
- `beforeAll`/`afterAll` でサーバーのライフサイクルを管理
- テスト分離のため `resetTestState()`/`cleanupTestState()` を使用
