# ADR 013: Security Hardening

## Status

Accepted

## Context

ttyd-mux はブラウザからターミナルにアクセスするツールであり、以下のセキュリティリスクがあった:

### 1. コマンドインジェクション

```typescript
// 危険: ユーザー入力をそのままシェルに渡す
execSync(`tmux new-session -s ${sessionName}`);
```

セッション名に `; rm -rf /` のような悪意のある文字列が含まれる可能性。

### 2. HTTP セキュリティヘッダーの欠如

XSS、クリックジャッキング、MIME スニッフィングなどの攻撃に対する防御がなかった。

### 3. セッション名のバリデーション不足

API でセッション作成時に不正な名前を受け付けていた。

## Decision

### 1. spawnSync によるコマンド実行

シェルを介さずに直接プロセスを起動する:

```typescript
// Before: シェル経由（危険）
execSync(`tmux new-session -s ${sessionName}`);

// After: 配列引数で直接実行（安全）
spawnSync('tmux', ['new-session', '-s', sessionName]);
```

**ProcessRunner インターフェースに spawnSync を追加:**

```typescript
interface ProcessRunner {
  spawn(command: string, args: string[], options?: SpawnOptions): ChildProcess;
  spawnSync(command: string, args: string[], options?: SpawnSyncOptions): SpawnSyncReturns<string>;
  kill(pid: number, signal?: string): boolean;
}
```

### 2. HTTP セキュリティヘッダー

すべてのレスポンスに以下のヘッダーを追加:

```typescript
function setSecurityHeaders(res: ServerResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}
```

| ヘッダー | 効果 |
|---------|------|
| `X-Content-Type-Options: nosniff` | MIME スニッフィング防止 |
| `X-Frame-Options: SAMEORIGIN` | クリックジャッキング防止 |
| `X-XSS-Protection: 1; mode=block` | XSS フィルタ有効化 |
| `Referrer-Policy` | リファラー情報の漏洩制限 |

### 3. セッション名のサニタイズ

API ハンドラでセッション名を検証:

```typescript
const SESSION_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

function sanitizeSessionName(name: string): string {
  if (!SESSION_NAME_REGEX.test(name)) {
    throw new Error(`Invalid session name: ${name}`);
  }
  return name;
}
```

許可する文字:
- 英数字 (`a-z`, `A-Z`, `0-9`)
- アンダースコア (`_`)
- ハイフン (`-`)

## Consequences

### Positive

- **コマンドインジェクション防止**: 引数が適切にエスケープされる
- **XSS/クリックジャッキング防止**: ブラウザのセキュリティ機能が有効化
- **入力検証**: 不正なセッション名を早期に拒否
- **DI パターンとの統合**: ProcessRunner を通じてテスト可能

### Negative

- **互換性**: 日本語やスペースを含むセッション名が使用不可
- **オーバーヘッド**: spawnSync は execSync より若干遅い（実測で無視できるレベル）

### Neutral

- **Caddy 側の認証**: 外部公開時の認証は引き続き Caddy 側で設定（ADR 005 参照）

## Notes

### セキュリティ対策の範囲

| 対策 | ttyd-mux | Caddy |
|------|----------|-------|
| コマンドインジェクション | ✓ | - |
| HTTP ヘッダー | ✓ | ✓ |
| 認証 | - | ✓ |
| TLS | - | ✓ |

### 関連コミット

- `846cc66 security(api-handler): sanitize session names on creation`
- `ddfac30 security(router): add HTTP security headers`
- `2707200 security(tmux-client): prevent command injection in tmux operations`
- `8802452 feat(process-runner): add spawnSync method for safe command execution`

### 関連 ADR

- ADR 005: Static Mode and Deploy - Caddy での認証設定
- ADR 009: Dependency Injection for Testability - ProcessRunner の DI
