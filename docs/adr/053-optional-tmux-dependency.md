# ADR 053: Optional tmux Dependency

## ステータス

採用

## コンテキスト

bunterm は当初 tmux を必須としていた（`tmux_mode` のデフォルト値が `'auto'`）。しかし Native Terminal モード（Bun.Terminal）の実装により、tmux なしでも完全に動作可能になった。

### 問題点

1. tmux がインストールされていない環境で bunterm が起動できない
2. `bunterm attach` コマンドが tmux 未インストール時にわかりにくいエラーを出す
3. 新規ユーザーが tmux のインストールを強いられる

## 決定

### 1. デフォルト値の変更

`tmux_mode` のデフォルト値を `'auto'` から `'none'` に変更。

```typescript
// src/config/types.ts
tmux_mode: TmuxModeSchema.default('none'),  // Before: 'auto'
```

### 2. attach コマンドの改善

`bunterm attach` コマンドで tmux 未インストール時に明確なエラーメッセージを表示。

```typescript
// src/commands/attach.ts
function isTmuxInstalled(): boolean {
  try {
    execSync('which tmux', { stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
}

async function attachToSession(name: string): Promise<void> {
  if (!isTmuxInstalled()) {
    console.error('tmux is not installed.');
    console.error('Install tmux or use bunterm without tmux (default mode).');
    process.exit(1);
  }
  // ...
}
```

### 3. tmux_mode 設定

| モード | 説明 |
|--------|------|
| `none` | tmux を使用しない（新デフォルト） |
| `auto` | 既存セッションがあればアタッチ、なければ新規作成 |
| `attach` | 既存セッションにアタッチのみ |
| `new` | 常に新規セッションを作成 |

## 代替案

### tmux を引き続き必須とする

tmux があることで得られる利点（セッション永続化、デタッチ/アタッチ）を維持。

**採用しなかった理由**:
- Native Terminal で同等の機能を提供可能
- インストールの障壁を下げることが優先

### tmux の自動インストール

tmux がなければ自動でインストールを試みる。

**採用しなかった理由**:
- システムへの予期しない変更を避けるべき
- パッケージマネージャーの差異による複雑性

## 影響

### Positive

- 新規ユーザーの導入障壁が下がる
- tmux 不要で bunterm を利用可能
- シンプルな初期セットアップ

### Negative

- tmux ユーザーはデフォルト設定を変更する必要がある

### Migration

tmux を使いたいユーザーは `config.yaml` に追加:

```yaml
tmux_mode: auto
```

## 関連

- ADR 038: Native Terminal with Bun
- ADR 052: DA Response Filtering

## 関連コミット

- `d1b4474 feat(attach): add tmux installation check`
