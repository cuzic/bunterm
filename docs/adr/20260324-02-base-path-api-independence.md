# ADR 068: base_path の正規化と API ルーティングの独立

## ステータス

採用

## コンテキスト

`bunterm up` が `base_path: /` の環境で動作しないバグが発生した。原因は2つ:

1. **CLI クライアントが `base_path` を正規化せずに使用** — `buildApiUrl()` が `config.base_path`（`"/"`）をそのまま連結し、`http://localhost:7680//api/sessions` という無効な URL を生成
2. **サーバーのレスポンスとクライアントの期待する形式が乖離** — サーバーは `{success, data, requestId}` エンベロープで返すが、クライアントは生データを期待

テストは通っていた。mock サーバーが旧形式（エンベロープなし）で応答しており、同じ乖離を持っていたため。

## 決定

### 1. base_path のパース時正規化

`ConfigSchema` に `.transform()` を追加し、trailing slash を除去:

```typescript
base_path: z.string().startsWith('/').default('/bunterm')
  .transform((v) => v.replace(/\/+$/, ''))
```

`"/"` → `""`、`"/bunterm/"` → `"/bunterm"` に正規化。`normalizeBasePath()` 関数は廃止。

### 2. CLI→デーモン通信に base_path を使わない

`buildApiUrl()` から `config.base_path` を除去:

```typescript
// Before
return `${getDaemonUrl(config)}${config.base_path}${path}`;

// After
return `${getDaemonUrl(config)}${path}`;
```

`base_path` はリバースプロキシ（Caddy）のプレフィックスであり、デーモン直通通信には関係ない。

### 3. サーバーの API ルーティングから base_path 依存を除去

```typescript
// Before
if (pathname.startsWith(`${basePath}/api/`))

// After
if (pathname.startsWith('/api/'))
```

API は常に `/api/...` で受付。`base_path` は HTML リンク生成・静的ファイル・WS パスのみで使用。

## 代替案

- **normalizeBasePath を呼び出し側で徹底** — 呼び忘れバグの根本原因が残る
- **base_path のデフォルトを空文字に** — YAML として不自然

## 影響

- CLI→デーモン通信が base_path に依存しなくなり、`base_path: /` でも正常動作
- Config から取得した値をそのまま使える（normalize 不要）
- 同じサーバー上で HTML は `base_path` 付き、API は `base_path` なしで動作（Web アプリの標準パターン）

## 関連

- ADR 066: Elysia + Eden migration（この修正後に Elysia 移行を実施）
