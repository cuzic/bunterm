# ADR 061: Result<T, E> 型によるエラーハンドリング

## ステータス

採用

## 日付

2026-03-21

## コンテキスト

bunterm のサーバーサイドコードでは、エラーハンドリングに例外（throw/try-catch）を多用していた。HTTP ルートハンドラ、セッション管理、ファイル操作など多くの箇所で例外が使われており、以下の問題が発生していた。

### 問題点

1. **エラーの暗黙性**: 関数シグネチャからどのエラーが発生しうるか判別できない
2. **catch 漏れ**: try-catch を書き忘れるとエラーが上位に伝播し、500 エラーになる
3. **型安全性の欠如**: catch ブロックの `error` は `unknown` 型で、型ガードが必要
4. **HTTP ステータスの散在**: エラーコードから HTTP ステータスへのマッピングが各ハンドラに散在

```typescript
// Before: 例外ベース
async function getSession(name: string): Promise<SessionState> {
  const session = sessions.get(name);
  if (!session) {
    throw new Error(`Session ${name} not found`); // 呼び出し側で catch 必須だが保証なし
  }
  return session;
}
```

### 他プロジェクトでの知見

関数型プログラミングの Result/Either パターンは、エラーを戻り値として明示的に扱い、コンパイル時にエラーハンドリングを強制できる。

## 決定

**代数的 Result<T, E> 型**を導入し、ビジネスロジックのエラーハンドリングを例外から明示的な戻り値に移行する。

### Result 型の定義

```typescript
// src/utils/result.ts
interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

type Result<T, E> = Ok<T> | Err<E>;

function ok<T>(value: T): Ok<T>;
function err<E>(error: E): Err<E>;
function isOk<T, E>(result: Result<T, E>): result is Ok<T>;
function isErr<T, E>(result: Result<T, E>): result is Err<E>;
```

### ドメインエラー型

```typescript
// src/core/errors.ts
interface DomainError {
  readonly code: string;
  readonly message: string;
}

interface SessionNotFoundError {
  readonly code: 'SESSION_NOT_FOUND';
  readonly message: string;
  readonly sessionName: string;
}

interface SessionAlreadyExistsError {
  readonly code: 'SESSION_ALREADY_EXISTS';
  readonly message: string;
  readonly sessionName: string;
}
// ... 各ドメイン固有のエラー型
```

### HTTP ステータスマッピング

ドメインエラーコードから HTTP ステータスへのマッピングを一箇所に集約：

```typescript
const STATUS_MAP: Record<string, number> = {
  SESSION_NOT_FOUND: 404,
  SESSION_ALREADY_EXISTS: 409,
  SESSION_INVALID_NAME: 400,
  SHARE_NOT_FOUND: 404,
  SHARE_EXPIRED: 410,
  UNAUTHORIZED: 401,
  // ...
};
```

### 使用例

```typescript
// After: Result ベース
function getSession(name: string): Result<SessionState, SessionNotFoundError> {
  const session = sessions.get(name);
  if (!session) {
    return err({ code: 'SESSION_NOT_FOUND', message: `Session ${name} not found`, sessionName: name });
  }
  return ok(session);
}

// ルートハンドラ
handler: async (ctx) => {
  const result = sessionManager.getSession(ctx.pathParams.name);
  return result; // フレームワークが ok → 200, err → STATUS_MAP[code] に変換
}
```

### 例外を使う場面

Result 型はすべての例外を置き換えるものではない。以下の区分で使い分ける：

| 状況 | 方式 | 理由 |
|------|------|------|
| ビジネスロジックのエラー | `Result<T, E>` | 呼び出し側でのハンドリングを型で強制 |
| プログラミングミス | `throw` | バグは即座にクラッシュすべき |
| 外部リソース障害 | `throw` | リトライ/サーキットブレーカーで処理 |
| バリデーションエラー | `Result<T, E>` | ユーザー入力は expected error |

## 代替案

### 1. neverthrow ライブラリ

TypeScript 向けの Result 型ライブラリ。`map`, `andThen`, `match` などのメソッドチェーンを提供。

**採用しなかった理由**:
- 外部依存を増やしたくない
- メソッドチェーン（`.map().andThen()`）よりも `if (isOk(result))` の方がチーム内で理解しやすい
- 自前実装は 30 行程度で十分

### 2. Effect (Effect-TS)

TypeScript の関数型エフェクトシステム。依存注入、エラーハンドリング、非同期処理を統合的に扱える。

**採用しなかった理由**:
- 学習曲線が非常に急峻
- プロジェクト全体のパラダイム変更が必要
- bunterm の規模には過剰

### 3. 例外 + 型ガードの強化

既存の例外ベースを維持し、カスタムエラークラスと `instanceof` チェックで型安全性を向上。

**採用しなかった理由**:
- `catch` を書き忘れる問題は解決しない
- 関数シグネチャにエラー情報が現れない
- `instanceof` は Bun のバンドル環境で問題が生じることがある

## 影響

### Positive

- **コンパイル時エラーチェック**: Result を返す関数は、呼び出し側で ok/err の分岐が必須
- **HTTP ステータスの一元管理**: ドメインエラーコードと HTTP ステータスのマッピングが一箇所に集約
- **テスト容易性**: エラーケースのテストが `expect(result.ok).toBe(false)` で明快
- **ドキュメント性**: 関数シグネチャがどのエラーを返しうるか明示

### Negative

- **冗長性**: 単純な操作でも `ok()` / `err()` のラッピングが必要
- **既存コードの移行コスト**: 例外ベースのコードを段階的に移行する必要がある
- **ネストの深さ**: 複数の Result を連鎖する場合、ネストが深くなりがち

## 関連

- ADR 059: Session Plugin による依存逆転 — DI と組み合わせたエラーハンドリング
- [docs/error-handling.md](../error-handling.md) — エラーハンドリングポリシー詳細
