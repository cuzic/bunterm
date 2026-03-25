# ADR 077: Symbol.dispose による明示的リソース管理

## ステータス

採用

## コンテキスト

bunterm には WebSocket 接続、PTY セッション、ファイル監視、イベントリスナーなど、明示的なクリーンアップが必要なリソースが多数存在する。これらのリソース管理を統一的に行う仕組みが必要だった。

### 問題点

1. **クリーンアップ忘れ**: 手動で `dispose()` や `close()` を呼び出す必要があり、呼び忘れによるリソースリークが発生
2. **一貫性のないインターフェース**: モジュールによって `dispose()`, `close()`, `cleanup()`, `destroy()` と名前が異なる
3. **型名の衝突**: 独自に定義した `Disposable` 型が TC39 の `Disposable` インターフェースと名前衝突

### TC39 Explicit Resource Management

[TC39 Explicit Resource Management](https://github.com/tc39/proposal-explicit-resource-management) は `using` キーワードと `Symbol.dispose` / `Symbol.asyncDispose` によるリソース管理を提案する仕様。スコープ終了時に自動的にリソースが解放される。

```typescript
{
  using server = createServer();
  // スコープ終了時に server[Symbol.dispose]() が自動呼出
}
```

## 決定

### Symbol.dispose の実装

bunterm のマネージャークラスに `Symbol.dispose` を実装し、`using` キーワードによる自動リソース解放を可能にする。

#### サーバー側マネージャー

```typescript
class SessionManager {
  [Symbol.dispose](): void {
    this.closeAllSessions();
  }
}
```

#### ブラウザ側マネージャー

```typescript
class FontSizeManager {
  [Symbol.dispose](): void {
    this.removeEventListeners();
  }
}
```

### DisposeFn への改名

既存の `Disposable` 型（クリーンアップ関数の型）を `DisposeFn` に改名し、TC39 の `Disposable` インターフェースとの名前衝突を回避する。

```typescript
// Before
type Disposable = () => void;

// After
type DisposeFn = () => void;
```

### tsconfig.json の更新

`Symbol.dispose` を使用するため、`lib` に `ESNext.Disposable` を追加する。

```json
{
  "compilerOptions": {
    "lib": ["ESNext", "ESNext.Disposable", "DOM"]
  }
}
```

### Bun バージョン要件

`Symbol.dispose` は Bun 1.3.5 以上でネイティブサポートされている。bunterm の既存要件（Bun 1.3.5+）を満たすため、追加のバージョン要件はない。

## 代替案

### 手動 dispose() メソッドの維持

**採用しなかった理由**:
- 呼び忘れのリスクが解消されない
- `using` キーワードによる自動解放の恩恵を受けられない
- TC39 標準に沿わない独自 API

### IDisposable インターフェース（C# スタイル）

```typescript
interface IDisposable {
  dispose(): void;
}
```

**採用しなかった理由**:
- `using` キーワードは `Symbol.dispose` を検出するため、独自インターフェースでは自動解放が機能しない
- TC39 標準に準拠する方が将来性が高い

### try/finally による手動管理

**採用しなかった理由**:
- ボイラープレートが多い
- ネストが深くなる
- `using` キーワードはこのパターンのシンタックスシュガー

## 影響

### Positive

- **リソースリーク防止**: `using` キーワードによりスコープ終了時に自動的にクリーンアップ
- **統一インターフェース**: すべてのマネージャーが `Symbol.dispose` を実装
- **TC39 標準準拠**: 将来のランタイムアップデートで追加の最適化が期待される
- **テスト容易性**: テスト内で `using` を使用することで、テスト終了時のクリーンアップが保証される

### Negative

- **Bun 依存**: `Symbol.dispose` のネイティブサポートが必要（Node.js は v22+ で対応）
- **学習コスト**: `using` キーワードと `Symbol.dispose` のセマンティクスを理解する必要がある
- **既存コードの修正**: すべてのマネージャーに `Symbol.dispose` を追加する作業

## 関連

- ADR 057: Scope/Mountable Pattern
