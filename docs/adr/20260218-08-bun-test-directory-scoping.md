# ADR 021: Bun Test Directory Scoping

## Status

Accepted

## Context

`bun test` を直接実行すると、`e2e/ttyd-mux.spec.ts` が読み込まれ、以下のエラーが発生する問題があった。

```
error: Playwright Test did not expect test.describe() to be called here.
```

### 原因

1. `package.json` の `"test": "bun test src/"` スクリプトは `src/` に限定されている
2. しかし、`bun test` を引数なしで直接実行すると、プロジェクト全体を検索する
3. `e2e/` ディレクトリの `*.spec.ts` ファイルが bun test に拾われる
4. Playwright の `test.describe()` は Playwright のテストランナーでのみ動作し、bun test との互換性がない

### テストの種類

| 種類 | ディレクトリ | 拡張子 | ランナー |
|------|-------------|--------|----------|
| ユニットテスト | `src/` | `*.test.ts` | bun test |
| e2e テスト | `e2e/` | `*.spec.ts` | Playwright |

## Decision

`bunfig.toml` に `[test]` セクションを追加し、bun test のスコープを `src/` ディレクトリに限定する。

```toml
# bunfig.toml
[test]
# Only run tests in src/ directory
# e2e tests use Playwright and should be run with 'bun run test:e2e'
root = "./src"
```

### 代替案

1. **package.json スクリプトのみに頼る**
   - 却下: `bun test` を直接実行した場合にエラーになる
   - 開発者体験が悪い

2. **e2e テストを別のディレクトリ構造に変更**
   - 却下: Playwright の規約に従った `e2e/` ディレクトリは明確
   - 変更する必要性がない

3. **bun test に `--ignore` オプションを使用**
   - 却下: bun test には `--ignore` オプションが存在しない
   - bunfig.toml での設定が公式の方法

## Consequences

### Positive

- `bun test` を引数なしで実行しても正しく動作
- `bun run test` と `bun test` の動作が一致
- 設定ファイルで明示的にテストスコープを定義
- e2e テストは引き続き `bun run test:e2e` で実行可能

### Negative

- `bunfig.toml` に設定が追加される
  - ただし、これは bun の標準的な設定ファイル

### 関連コマンド

```bash
# ユニットテスト（どちらでも同じ）
bun test
bun run test

# e2e テスト
bun run test:e2e
bun run test:e2e:headed
bun run test:e2e:debug
```

## References

- Bun test configuration: https://bun.sh/docs/cli/test
- Playwright test configuration: https://playwright.dev/docs/test-configuration
- ADR 007: Test Isolation Strategy（テスト分離の関連決定）
