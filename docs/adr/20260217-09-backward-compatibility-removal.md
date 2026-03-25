# ADR 012: Backward Compatibility Removal

## Status

Accepted

## Context

ADR 011 でモジュール分割を行った際、既存コードの互換性を保つために以下のパターンを使用していた:

### 1. 再エクスポート（Re-exports）

```typescript
// caddy/client.ts
export { createProxyRoute, findServerForHost, ... } from './route-builder.js';
```

### 2. デリゲートメソッド

```typescript
// CaddyClient class
findServerForHost = findServerForHost;  // standalone function への委譲
```

### 3. シングルトンラッパー関数

```typescript
// session-manager.ts
const sessionManager = new SessionManager();

export function startSession(options) {
  return sessionManager.startSession(options);
}
export function stopSession(name) {
  sessionManager.stopSession(name);
}
// ... 他のラッパー関数
```

### 問題点

- **依存関係が不明瞭**: 実際の実装がどこにあるか追跡が困難
- **デッドコードの温床**: 使われていない再エクスポートが残る
- **二重のAPI**: 同じ機能に複数のアクセス方法がある
- **リファクタリングの障壁**: 後方互換性を維持するコストが増大

## Decision

**後方互換性コードを削除し、明示的なインポートに移行**する。

### 削除対象

| ファイル | 削除内容 |
|----------|----------|
| `client/index.ts` | 後方互換エイリアス（型エイリアス等） |
| `caddy/client.ts` | route-builder 関数の再エクスポート、デリゲートメソッド |
| `daemon/server.ts` | `findSessionForPath` の再エクスポート |
| `tmux.ts` | `TmuxClient`, `createTmuxClient`, `createMockTmuxClient` の再エクスポート |
| `session-manager.ts` | シングルトンラッパー関数（`startSession`, `stopSession`, `listSessions` 等） |

### 移行パターン

**Before (再エクスポート経由):**
```typescript
import { createProxyRoute, connectToCaddy } from '@/caddy/client.js';
```

**After (直接インポート):**
```typescript
import { connectToCaddy } from '@/caddy/client.js';
import { createProxyRoute } from '@/caddy/route-builder.js';
```

**Before (シングルトンラッパー):**
```typescript
import { startSession, stopSession, listSessions } from './session-manager.js';

startSession(options);
stopSession(name);
```

**After (インスタンスメソッド):**
```typescript
import { sessionManager } from './session-manager.js';

sessionManager.startSession(options);
sessionManager.stopSession(name);
```

### 残したもの

- **型の再エクスポート**: `caddy/client.ts` からの `CaddyConfig`, `CaddyRoute`, `CaddyServer` 型
  - 理由: 型は実行時コストがなく、利便性が高い
- **ユーティリティ関数**: `allocatePort`, `sessionNameFromDir`
  - 理由: これらは SessionManager に依存しない純粋関数

## Consequences

### Positive

- **依存関係が明示的**: インポート文を見れば実際のソースがわかる
- **デッドコード排除**: 使われていないエクスポートを検出しやすい
- **API の一貫性**: 各モジュールが単一のアクセス方法を提供
- **Tree-shaking 効率向上**: 不要なコードがバンドルに含まれにくい
- **IDE サポート向上**: 定義へのジャンプが正確に

### Negative

- **インポート文の増加**: 複数ファイルからインポートが必要な場合がある
- **既存コードの修正**: 呼び出し側のインポート文を更新する必要がある

### Migration Impact

| 影響を受けたファイル | 変更内容 |
|---------------------|----------|
| `commands/caddy.ts` | route-builder から直接インポート |
| `daemon/index.ts` | `sessionManager.stopAllSessions()` に変更 |
| `daemon/router.ts` | `sessionManager.listSessions()` に変更 |
| `daemon/api-handler.ts` | sessionManager インスタンスメソッドに変更 |
| `daemon/proxy.test.ts` | モックを sessionManager 形式に変更、DI パターンに移行 |
| `daemon/server.feature.test.ts` | router.ts から直接インポート |

## Notes

### 後方互換性を残す判断基準

以下の場合は後方互換性を維持する:
1. **公開 API**: npm パッケージとして公開する場合
2. **安定性が重要**: 多くの外部依存がある場合
3. **段階的移行**: 大規模な移行を段階的に行う場合

本プロジェクトは内部ツールであり、上記に該当しないため削除を選択した。

### 関連 ADR

- ADR 011: Module Cohesion Improvement - 分割の決定
- ADR 009: Dependency Injection for Testability - DI パターンの導入
