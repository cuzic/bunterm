# ADR 040: ターミナル出力の秘密情報マスキング

## Status

Accepted

## Context

Command Block API でコマンド出力を永続化する際、以下のリスクがある：

1. **秘密情報の混入**: 環境変数のダンプ、設定ファイルの cat 等で API キーやパスワードが出力される
2. **ログの共有**: エージェント間でブロックを共有する際に秘密が漏洩
3. **履歴の永続化**: 長期保存されたブロックに秘密が残留

### 検出対象

| カテゴリ | 例 |
|---------|-----|
| AWS | `AKIAIOSFODNN7EXAMPLE`, `aws_secret_access_key=...` |
| JWT | `eyJhbGciOiJIUzI1NiIs...` |
| GitHub | `ghp_xxxx`, `gho_xxxx`, `ghs_xxxx`, `ghr_xxxx` |
| Google Cloud | `AIzaSy...` |
| Slack | `xoxb-...`, `xoxp-...` |
| NPM | `npm_...` |
| Generic | `password=...`, `secret=...`, `-----BEGIN PRIVATE KEY-----` |

## Decision

**パターンベースの Redaction パイプライン**を実装する。

### OutputRedactor

```typescript
const BUILTIN_PATTERNS: RedactionPattern[] = [
  { name: 'aws_access_key', pattern: /AKIA[0-9A-Z]{16}/g },
  { name: 'aws_secret_key', pattern: /(?:aws_secret_access_key|AWS_SECRET_ACCESS_KEY)\s*[=:]\s*[A-Za-z0-9/+=]{40}/g },
  { name: 'jwt', pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g },
  { name: 'github_token', pattern: /gh[psortu]_[A-Za-z0-9]{36,}/g },
  // ...
];

class OutputRedactor {
  redact(text: string): string {
    for (const { pattern, replacement } of this.patterns) {
      text = text.replace(pattern, replacement ?? '[REDACTED]');
    }
    return text;
  }
}
```

### 統合ポイント

```
Terminal Output
      │
      ▼
┌─────────────────┐
│ OutputRedactor  │ ← BlockStore 内で自動適用
│ - Built-in      │
│ - Custom        │
└─────────────────┘
      │
      ▼
┌─────────────────┐
│ BlockStore      │
│ - Chunks        │
│ - Preview       │
└─────────────────┘
```

### カスタムパターン

設定ファイルで追加パターンを定義可能（将来対応）：

```yaml
redaction:
  enabled: true
  custom_patterns:
    - name: "internal_token"
      pattern: "INTERNAL_[A-Z0-9]{20}"
      replacement: "[INTERNAL_TOKEN]"
```

### API

```typescript
// 基本使用
const redactor = createRedactor();
const safe = redactor.redact(output);

// 統計付き
const { result, stats } = redactor.redactWithStats(output);
// stats: { totalRedactions: 3, patternMatches: { 'jwt': 2, 'aws_access_key': 1 } }

// 検出のみ
const hasSensitive = redactor.containsSensitive(output);
```

## Consequences

### Positive

- **自動保護**: 開発者が意識せずとも秘密が保護される
- **拡張可能**: 組み込みパターン + カスタムパターン
- **非破壊**: 元データを変更せず、保存時のみ適用
- **可視性**: 統計で何がマスクされたか確認可能

### Negative

- **誤検出**: 32 文字以上のランダム文字列は API キーと誤認される可能性
- **性能影響**: 大量出力時に正規表現マッチングのコスト
- **見逃し**: 未知のパターンは検出できない

### 対策

1. **誤検出対策**: パターンは厳密に設計、汎用パターンは慎重に
2. **性能対策**: チャンク単位で処理、巨大出力は truncate
3. **見逃し対策**: カスタムパターンで組織固有の秘密に対応

## Implementation Details

### 組み込みパターン一覧

| 名前 | パターン |
|------|---------|
| `aws_access_key` | `AKIA[0-9A-Z]{16}` |
| `aws_secret_key` | `aws_secret_access_key=...` (40 文字) |
| `jwt` | `eyJ...\.eyJ...\.xxx` |
| `github_token` | `gh[psortu]_xxx` (36+ 文字) |
| `google_api_key` | `AIzaSy...` (35 文字) |
| `slack_token` | `xox[bpas]-...` |
| `npm_token` | `npm_...` (36+ 文字) |
| `private_key` | `-----BEGIN ... PRIVATE KEY-----` |
| `basic_auth_url` | `://user:password@host` |
| `password_assignment` | `password=...` |
| `secret_assignment` | `secret=...` |
| `api_key_assignment` | `api_key=...` |

### テスト

```typescript
describe('OutputRedactor', () => {
  it('should redact AWS access key', () => {
    const redactor = createRedactor();
    const input = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE';
    const result = redactor.redact(input);
    expect(result).toBe('AWS_ACCESS_KEY_ID=[REDACTED]');
  });
});
```

## References

- [OWASP Sensitive Data Exposure](https://owasp.org/Top10/A02_2021-Cryptographic_Failures/)
- [git-secrets](https://github.com/awslabs/git-secrets)
- [detect-secrets](https://github.com/Yelp/detect-secrets)
