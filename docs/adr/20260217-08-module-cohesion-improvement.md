# ADR 011: Module Cohesion Improvement

## Status

Accepted

## Context

コードベースの成長に伴い、いくつかのモジュールが複数の責務を持ち、凝集性が低下していた。

### 問題のあったモジュール

**1. daemon/server.ts (353行, 5つの責務)**
- HTTP サーバー作成
- API リクエストハンドリング
- ポータルページ生成
- HTTP プロキシ
- WebSocket プロキシ

**2. client/index.ts (262行, 2つの関心事)**
- デーモンとのソケット通信（ping, shutdown）
- HTTP API クライアント（sessions, status）

**3. caddy/client.ts (343行, 3つの関心事)**
- Caddy Admin API クライアント
- 型定義
- ルート生成ロジック

これらの問題点:
- 単一ファイルの変更が広範囲に影響
- テスト時のモック範囲が広い
- 依存性注入が困難
- コードの理解が困難

## Decision

**単一責任原則（SRP）に基づきモジュールを分割**する。

### 1. daemon/server.ts の分割

```
daemon/
├── server.ts          # HTTP サーバー作成のみ (25行)
├── api-handler.ts     # REST API ハンドラ (104行)
├── http-proxy.ts      # HTTP プロキシ + IME injection (92行)
├── ws-proxy.ts        # WebSocket プロキシ (113行)
├── router.ts          # リクエストルーティング (73行)
└── portal.ts          # ポータル HTML 生成（既存）
```

**ルーティングフロー:**
```
server.ts
  ├── handleRequest() → router.ts
  │     ├── /api/* → api-handler.ts
  │     ├── /base_path → portal.ts
  │     └── /session/* → http-proxy.ts
  └── handleUpgrade() → ws-proxy.ts
```

### 2. client/index.ts の分割

```
client/
├── index.ts           # 再エクスポートのみ (20行)
├── daemon-client.ts   # ソケット通信 (189行)
└── api-client.ts      # HTTP API クライアント (79行)
```

### 3. caddy/client.ts の分割

```
caddy/
├── client.ts          # CaddyClient クラスのみ (80行)
├── types.ts           # 型定義 (29行)
└── route-builder.ts   # ルート生成関数 (200行)
```

## Consequences

### Positive

- **責務の明確化**: 各モジュールが単一の責務を持つ
- **テスタビリティ向上**: 小さなモジュールは個別にテスト可能
- **依存性注入が容易**: ADR 009 のDIパターンと組み合わせやすい
- **変更の影響範囲縮小**: 一部の変更が他に波及しにくい
- **コードの理解が容易**: ファイル名から責務が推測可能

### Negative

- **ファイル数の増加**: 3ファイル → 12ファイル
- **インポート文の増加**: 使用側で複数のインポートが必要になる場合がある
- **初期の学習コスト**: 新規参加者はファイル構成を把握する必要がある

### Neutral

- **行数の総計は微増**: 分割によるボイラープレート（import文等）が増加
- **パフォーマンスへの影響なし**: Bun のモジュール解決は高速

## Notes

### 分割の判断基準

以下の場合にモジュール分割を検討する:
1. 1ファイルが200行を超える
2. 複数の異なる関心事を扱っている
3. テスト時に広範囲のモックが必要
4. 変更頻度が異なる部分が混在している

### 関連ADR

- ADR 009: Dependency Injection for Testability - 分割したモジュールでDIを活用
