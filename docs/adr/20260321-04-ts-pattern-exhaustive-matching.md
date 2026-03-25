# ADR 076: ts-pattern による網羅的パターンマッチング

## ステータス

採用

## コンテキスト

bunterm では WebSocket メッセージや設定値の処理に discriminated union を多用している。これらの分岐処理を `switch/case` や `if/else` チェーンで記述していたが、型安全性と保守性に問題があった。

### 問題点

1. **網羅性の保証なし**: `switch/case` に `default` を書くと、新しいバリアントを追加した際にコンパイルエラーにならない
2. **型の絞り込みが不十分**: `if/else` チェーンでは TypeScript の型絞り込みが期待通りに動作しないケースがある
3. **可読性**: ネストした条件分岐が深くなり、各ブランチの処理が見づらい

```typescript
// Before: switch/case — 新しいメッセージ型を追加しても default に吸収される
switch (message.type) {
  case "input": handleInput(message); break;
  case "resize": handleResize(message); break;
  default: console.warn("Unknown message type");
}
```

## 決定

### ts-pattern の採用

[ts-pattern](https://github.com/gverber/ts-pattern) を導入し、discriminated union の分岐処理に使用する。

#### `.exhaustive()` による網羅性保証

すべての WebSocket メッセージハンドラで `.exhaustive()` を使用し、コンパイル時に全バリアントの処理漏れを検出する。

```typescript
import { match } from "ts-pattern";

// After: ts-pattern — 新しいメッセージ型を追加するとコンパイルエラー
match(message)
  .with({ type: "input" }, (msg) => handleInput(msg))
  .with({ type: "resize" }, (msg) => handleResize(msg))
  .with({ type: "ping" }, (msg) => handlePing(msg))
  .exhaustive();
```

### 規約

- **WebSocket メッセージハンドラ**: すべて `.exhaustive()` を使用する
- **discriminated union の分岐**: `switch/case` ではなく `match().with().exhaustive()` を使用する
- **単純な 2-3 分岐**: `if/else` でも可。ただし union 型の網羅性が必要な場合は `ts-pattern` を使用する

## 代替案

### switch/case + never チェック

```typescript
switch (message.type) {
  case "input": /* ... */ break;
  case "resize": /* ... */ break;
  default: {
    const _exhaustive: never = message;
    throw new Error(`Unhandled: ${_exhaustive}`);
  }
}
```

**採用しなかった理由**:
- ランタイムエラーに依存（`never` 型チェックはコンパイルエラーだが、`default` を忘れると機能しない）
- ボイラープレートが多い
- ネストしたパターンマッチングが困難

### if/else チェーン

**採用しなかった理由**:
- 網羅性のコンパイル時チェックが不可能
- 条件の順序に依存し、バグの温床になりやすい

### Effect の Match

**採用しなかった理由**:
- Effect エコシステム全体を導入する必要はなく、パターンマッチングのみが必要
- ts-pattern は軽量で単一目的のライブラリ

## 影響

### Positive

- **コンパイル時の網羅性保証**: 新しいメッセージ型やバリアントを追加した際、処理漏れが即座にコンパイルエラーとして検出される
- **型の自動絞り込み**: `.with()` のコールバック内で型が自動的に絞り込まれる
- **可読性向上**: パターンマッチングの意図が明確に表現される
- **ネストパターン対応**: オブジェクトの深い構造に対するマッチングが宣言的に記述可能

### Negative

- **外部依存の追加**: `ts-pattern` パッケージへの依存
- **学習コスト**: チームメンバーが ts-pattern の API を習得する必要がある
- **デバッグ**: スタックトレースが ts-pattern 内部を通過するため、エラー発生箇所の特定が若干困難になる場合がある

## 関連

- ADR 060: WebSocket Security and Session Validation
