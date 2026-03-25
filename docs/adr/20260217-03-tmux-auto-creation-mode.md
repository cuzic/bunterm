# ADR 006: Tmux Session Auto-Creation Mode

## Status

Accepted

## Context

ttyd を起動する際、tmux セッションの扱いに複数のパターンがある:

1. **既存セッションにアタッチ**: `tmux attach-session -t name`
   - セッションが存在しない場合はエラー
2. **新規セッション作成**: `tmux new-session -s name`
   - セッションが既に存在する場合はエラー
3. **自動モード**: `tmux new -A -s name`
   - 存在すればアタッチ、なければ作成

従来の ttyd-mux は `tmux new -A -s name` を使用していたが、この方法には問題があった:

**問題**: ttyd が `tmux new -A` を実行すると、最初の接続時に tmux セッションが作成される。しかし、作業ディレクトリ (`cwd`) が ttyd のプロセスディレクトリになり、ユーザーが期待するプロジェクトディレクトリにならない。

## Decision

### 1. tmux_mode 設定の追加

**決定**: `config.yaml` に `tmux_mode` 設定を追加

```yaml
tmux_mode: auto  # 'auto' | 'attach' | 'new'
```

| モード | 動作 |
|--------|------|
| `auto` | ttyd 起動前に tmux セッションを作成、その後 attach |
| `attach` | 既存の tmux セッションにアタッチのみ |
| `new` | 常に新規セッションを作成 |

デフォルトは `auto`。

### 2. Auto モードの実装

**決定**: `auto` モードでは ttyd 起動前に tmux セッションを事前作成

```typescript
// session-manager.ts
if (tmuxMode === 'auto') {
  ensureSession(name, dir);  // cwd を指定してセッション作成
}

// ttyd は attach-session を実行
const tmuxCmd = ['tmux', 'attach-session', '-t', name];
```

**ensureSession の実装**:
```typescript
export function ensureSession(sessionName: string, cwd?: string): void {
  if (!sessionExists(sessionName)) {
    const options = { stdio: 'ignore', cwd };
    execSync(`tmux new-session -d -s ${sessionName}`, options);
  }
}
```

### 3. ttyd コマンドの分離

**決定**: tmux モードに応じて ttyd に渡すコマンドを変更

```typescript
function getTmuxCommand(name: string, mode: TmuxMode): string[] {
  switch (mode) {
    case 'attach':
      return ['tmux', 'attach-session', '-t', name];
    case 'new':
      return ['tmux', 'new-session', '-s', name];
    default:  // auto
      return ['tmux', 'attach-session', '-t', name];
  }
}
```

## Consequences

### Positive

- tmux セッションが正しい作業ディレクトリで作成される
- `ttyd-mux up` 実行時にすぐにプロジェクトディレクトリで作業開始可能
- 既存セッションがあれば再利用、なければ自動作成

### Negative

- ttyd 起動前に追加のプロセス起動（tmux new-session）が必要
- セッション作成と ttyd 起動の間にわずかなタイムラグ

### Edge Cases

| ケース | auto モード動作 |
|--------|-----------------|
| セッションなし | 新規作成 → attach |
| セッションあり（デタッチ） | 既存に attach |
| セッションあり（アタッチ済み） | 既存に attach（複数クライアント可） |

## References

- tmux man page: `new-session -d` (detached), `-s` (session name)
- ttyd `-W` flag: Wait for client connection
