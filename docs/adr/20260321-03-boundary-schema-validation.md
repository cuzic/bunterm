# ADR 062: 境界層でのスキーマバリデーション戦略

## ステータス

採用

## 日付

2026-03-21

## コンテキスト

bunterm には多数の境界（boundary）が存在する：WebSocket メッセージ、config.yaml、state.json、HTTP API リクエスト/レスポンス、CLI 入力、`JSON.parse()` の結果など。これらの境界では外部からのデータが流入し、型安全性が保証されない。

### 問題点

境界入力の棚卸し（[docs/boundary-inventory.md](../boundary-inventory.md)）により、以下の状況が判明した：

| 境界タイプ | 箇所数 | バリデーション状態 |
|-----------|--------|-------------------|
| HTTP Routes | ~30 | 部分的（Zod スキーマあり） |
| JSON.parse() | ~35 | ほぼ未検証 |
| WebSocket messages | ~5 | 型アサーションのみ |
| CLI options | ~40+ | スキーマなし |
| process.env | ~30 | バリデーションなし |

典型的な問題パターン：

```typescript
// 危険: JSON.parse の結果を型アサーションで受ける
const data = JSON.parse(raw) as ClientMessage; // 実行時チェックなし

// 危険: WebSocket メッセージを直接キャスト
ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString()) as ServerMessage;
});
```

### 目標

すべての境界で「Raw 型 → バリデーション → Domain 型」の変換を体系的に行い、不正なデータがドメイン層に侵入しない構造を作る。

## 決定

**Zod スキーマによる境界バリデーション**を体系的に導入する。すべての外部入力は境界層でバリデーションし、Domain 型に変換してからドメインロジックに渡す。

### 原則

1. **すべての境界で検証**: JSON.parse、WebSocket メッセージ、設定ファイル、CLI 入力、環境変数
2. **Raw → Domain 変換**: 境界層で Raw 型（unknown）を Domain 型に変換
3. **Domain 型では optional を避ける**: discriminated union を使い、状態を明示的に表現
4. **`?.` は境界のみ**: DOM 操作、外部入力パース、テストでのみ使用

### バリデーションパターン

#### WebSocket メッセージ

```typescript
// Raw → Domain 変換関数
function parseClientMessage(raw: unknown): Result<ClientMessage, ValidationError> {
  const parsed = ClientMessageSchema.safeParse(raw);
  if (!parsed.success) {
    return err({ code: 'VALIDATION_ERROR', message: parsed.error.message });
  }
  return ok(parsed.data);
}

// WebSocket ハンドラ
ws.on('message', (raw) => {
  const result = parseClientMessage(JSON.parse(raw.toString()));
  if (isErr(result)) {
    ws.send(JSON.stringify({ type: 'error', message: result.error.message }));
    return;
  }
  handleMessage(result.value); // Domain 型が保証される
});
```

#### 設定ファイル

```typescript
// config.yaml のバリデーション
const RawConfigSchema = z.object({
  base_path: z.string().optional(),
  base_port: z.number().optional(),
  daemon_port: z.number().optional(),
  listen_addresses: z.array(z.string()).optional(),
  // ...
});

function loadConfig(path: string): Result<Config, ConfigError> {
  const raw = yaml.parse(readFileSync(path, 'utf-8'));
  const parsed = RawConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return err({ code: 'CONFIG_INVALID', message: parsed.error.message, path });
  }
  return ok(applyDefaults(parsed.data)); // デフォルト値適用後の Domain 型
}
```

#### Optional フィールドポリシー

```typescript
// NG: Domain 型で optional
interface Session {
  name: string;
  tmuxSession?: string;  // ❌ tmux があるのかないのか曖昧
}

// OK: Discriminated union で状態を明示
type Session =
  | { type: 'native'; name: string }
  | { type: 'tmux'; name: string; tmuxSession: string };
```

### 適用優先度

| 優先度 | 境界 | 理由 |
|--------|------|------|
| P1 | WebSocket messages | セキュリティ上最も重要（外部からの直接入力） |
| P1 | HTTP Routes | 同上 |
| P1 | JSON.parse() | 型アサーションのみの箇所が多い |
| P2 | config.yaml / state.json | 不正設定でのクラッシュ防止 |
| P2 | CLI options | ユーザー入力の検証 |
| P3 | fetch() responses (browser) | ブラウザ側のレスポンス検証 |

## 代替案

### 1. 実行時型チェック（手書き）

Zod を使わず、手動で `typeof` / `in` 演算子で検証する。

**採用しなかった理由**:
- 検証コードが冗長になり、メンテナンスコストが高い
- スキーマとして宣言的に定義できない
- エラーメッセージの品質がバラつく

### 2. バリデーションなし（TypeScript の型を信頼）

TypeScript の型定義のみに頼り、実行時バリデーションを行わない。

**採用しなかった理由**:
- TypeScript の型はコンパイル時のみ有効。実行時には消える
- 外部入力（ネットワーク、ファイル、ユーザー入力）の型は保証されない
- 不正データによるクラッシュやセキュリティ脆弱性のリスク

### 3. io-ts / TypeBox のみ

Zod 以外のバリデーションライブラリを使用する。

**採用しなかった理由**:
- Zod は既にプロジェクトで使用中（HTTP ルートのスキーマ定義）
- Zod のエコシステムが最も成熟している
- ただしルート定義では TypeBox への移行を検討中（ADR 066 参照）

## 影響

### Positive

- **型安全性の保証**: 境界を超えるデータは必ずバリデーション済み
- **明確なエラーメッセージ**: Zod のエラーメッセージにより、どのフィールドが不正か明示
- **ドメイン層の簡潔さ**: optional チェックや型ガードが不要になり、ロジックに集中できる
- **セキュリティ向上**: 不正な入力がドメイン層に到達しない

### Negative

- **境界コードの増加**: 各境界にパース関数を定義する必要がある
- **パフォーマンスオーバーヘッド**: 実行時バリデーションのコスト（ターミナルアプリでは無視できる程度）
- **Zod スキーマの二重管理**: TypeScript 型と Zod スキーマの同期が必要（`z.infer` で軽減）

## 関連

- ADR 061: Result<T, E> 型によるエラーハンドリング — バリデーション失敗時の Result 返却
- [docs/domain-models.md](../domain-models.md) — ドメインモデル定義
- [docs/optional-field-inventory.md](../optional-field-inventory.md) — optional フィールドポリシー
- [docs/boundary-inventory.md](../boundary-inventory.md) — 境界入力の棚卸し
