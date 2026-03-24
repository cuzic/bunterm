# ADR 066: Elysia + Eden Migration for End-to-End Type Safety

## ステータス

採用

## コンテキスト

bunterm のサーバーは独自の Bun.serve ベースのルーティング基盤（RouteDef + RouteRegistry）を使用していた。CLI→デーモン通信用の `api-client.ts` は手書きで、サーバーのレスポンス形式と独立して定義されていた。

### 問題点

1. **手書きクライアントとサーバーの乖離**: `api-client.ts` のレスポンス型がサーバーの実際のレスポンス形式（envelope 構造）と一致しないバグが発生
2. **モックテストでは検知不可能**: テスト用モックも手書きだったため、モック自体が同じ乖離を持っていた
3. **スキーマの二重管理**: ルート定義の Zod スキーマとクライアント側の型定義が独立して存在し、同期が保証されない構造だった

根本原因は、サーバーとクライアントの間に**型レベルの構造的な結合**がないことにあった。

## 決定

### Elysia + Eden Treaty への移行

独自ルーティング基盤を [Elysia](https://elysiajs.com/) フレームワークに置換し、クライアントを [Eden Treaty](https://elysiajs.com/eden/treaty) に置換する。

#### 技術選定

| コンポーネント | Before | After |
|----------------|--------|-------|
| HTTP フレームワーク | 独自 Bun.serve + RouteDef | Elysia |
| API クライアント | 手書き api-client.ts | Eden Treaty |
| ルートスキーマ | Zod | TypeBox（Eden の型推論に必要） |
| 非ルートバリデーション | Zod | Zod（変更なし） |

#### 移行スコープ

- 51 API エンドポイント（REST）
- WebSocket ハンドラ
- SSE エンドポイント（2本）
- 静的ファイル配信
- 認証ミドルウェア
- セキュリティヘッダ、レート制限

#### 変更なし

- ビジネスロジック（session-manager, terminal, claude-watcher 等）
- WebSocket ユーティリティ（origin-validator, session-token, qos）
- ブラウザ側コード
- CLI コマンド体系

### ルートスキーマに TypeBox を採用

Eden Treaty が型推論を行うには TypeBox によるスキーマ定義が必要。Zod は Eden の型推論チェーンに対応していないため、ルート定義では TypeBox を使用する。

設定ファイルのバリデーション（config.yaml パース）や CLI 入力の検証など、ルート定義以外では引き続き Zod を使用する。

### Elysia のスコーピングルール

Elysia はプラグインのスコーピングが厳格。ミドルウェアプラグイン（認証、セキュリティヘッダ等）を他のプラグインから参照するには `.as('global')` が必要。

```typescript
// ミドルウェアプラグインは .as('global') で公開
const authPlugin = new Elysia()
  .derive(({ headers }) => ({ user: validateToken(headers) }))
  .as('global')
```

## 代替案

### OpenAPI codegen（openapi-typescript 等）

サーバー側で OpenAPI spec を出力し、クライアントコードを自動生成する。

**採用しなかった理由**:
- codegen ステップがビルドパイプラインに必要
- 生成コードと実装の同期タイミングにギャップが生じうる
- Eden は import するだけで型推論が完了し、codegen 不要

### tRPC

TypeScript ファーストの RPC フレームワーク。

**採用しなかった理由**:
- REST スタイルのルーティングを維持したい（既存の URL 構造を変えたくない）
- Elysia は Bun ネイティブで最適化されている
- OpenAPI/Swagger の自動生成が Elysia に組み込み

### 手書きクライアントの型テスト強化

既存構成を維持し、型テストや契約テストで乖離を検知する。

**採用しなかった理由**:
- テストは「乖離の検知」であり「乖離の防止」ではない
- Eden は構造的に乖離を不可能にする

## 影響

### Positive

- **End-to-end 型推論**: サーバーのルート定義からクライアントの型が自動推論され、手動同期が不要
- **OpenAPI/Swagger 自動生成**: ルート定義から API ドキュメントが自動生成
- **型安全な WebSocket**: Elysia の WebSocket 型定義による型チェック
- **Bun ネイティブ最適化**: Elysia は Bun 向けに最適化されたフレームワーク

### Negative

- **TypeBox の学習コスト**: ルートスキーマは Zod ではなく TypeBox で書く必要がある
- **Elysia のスコーピング理解が必要**: `.as('global')` や プラグイン間の依存関係を理解する必要がある
- **二種類のバリデーションライブラリ**: ルートは TypeBox、それ以外は Zod という使い分けが発生

### 構造変更

```
src/core/server/
├── elysia/              # NEW: Elysia ルート定義
│   ├── app.ts           # Elysia アプリケーション
│   ├── middleware/       # ミドルウェアプラグイン
│   ├── sessions.ts      # セッション API ルート
│   ├── auth.ts          # 認証ルート
│   ├── files.ts         # ファイル転送ルート
│   ├── websocket.ts     # WebSocket ハンドラ
│   └── ...              # 各機能のルート定義
├── server.ts            # Elysia ベースに更新
└── ...
```

## 関連

- ADR 009: Dependency Injection for Testability
- ADR 060: WebSocket Security and Session Validation

## 移行フェーズ

1. **Phase 0**: スパイク検証 — Elysia + Eden の最小動作確認
2. **Phase 1**: sessions API で End-to-End 型安全を実証
3. **Phase 2**: 全機能を移行（API、WebSocket、SSE、静的ファイル、認証）
4. **Phase 3**: クリーンアップ — 旧基盤削除、テスト更新、OpenAPI 生成、ドキュメント更新
