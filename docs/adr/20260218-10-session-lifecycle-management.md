# ADR 023: Session Lifecycle Management

## Status

Accepted

## Context

セッションのライフサイクル管理に以下の課題があった:

### 1. tmux セッションの残存

```bash
ttyd-mux down my-session  # ttyd プロセスは終了するが...
tmux list-sessions        # tmux セッションは残ったまま
```

ttyd を停止しても tmux セッションは残り続けるため、手動でクリーンアップが必要だった。

### 2. デーモンの無駄な稼働

```bash
ttyd-mux down my-session  # 最後のセッションを停止
ttyd-mux daemon status    # デーモンはまだ稼働中
```

全セッション停止後もデーモンが稼働し続け、リソースを消費していた。

### プロセス関係

```
ttyd-mux daemon (親プロセス)
├── ttyd (ttyd-mux が管理)
│   └── tmux (ttyd の子プロセス)
└── ttyd
    └── tmux
```

ttyd を終了しても tmux はデーモン化して残る。

## Decision

### 1. --kill-tmux オプションの追加

`down` コマンドに `--kill-tmux` オプションを追加:

```bash
# ttyd のみ停止（デフォルト）
ttyd-mux down my-session

# ttyd と tmux セッション両方を終了
ttyd-mux down my-session --kill-tmux
```

**実装:**

```typescript
// commands/down.ts
export function downCommand(program: Command): void {
  program
    .command('down [session]')
    .option('--kill-tmux', 'Also terminate the tmux session')
    .action(async (session, options) => {
      // ... セッション解決
      const result = await client.stopSession(sessionName, {
        killTmux: options.killTmux
      });
    });
}
```

```typescript
// session-manager.ts
async stopSession(name: string, options?: { killTmux?: boolean }): Promise<void> {
  const session = this.state.sessions.find(s => s.name === name);
  if (!session) return;

  // ttyd プロセスを終了
  this.processRunner.kill(session.pid, 'SIGTERM');

  // --kill-tmux が指定された場合、tmux セッションも終了
  if (options?.killTmux) {
    this.tmuxClient.killSession(name);
  }

  // 状態から削除
  this.removeSession(name);
}
```

### 2. デーモンの自動停止

最後のセッションが停止されたとき、デーモンも自動的に停止:

```typescript
// session-manager.ts
async stopSession(name: string, options?: StopOptions): Promise<StopResult> {
  // ... セッション停止処理

  // 残りのセッションを確認
  const remainingSessions = this.state.sessions.filter(s => s.name !== name);

  if (remainingSessions.length === 0) {
    logger.info('Last session stopped, shutting down daemon');
    // デーモン停止をスケジュール（現在のリクエスト完了後）
    process.nextTick(() => process.exit(0));
  }

  return result;
}
```

**動作:**

```bash
ttyd-mux up session1     # デーモン自動起動、セッション開始
ttyd-mux up session2     # 2つ目のセッション開始
ttyd-mux down session1   # session1 停止（デーモンは稼働継続）
ttyd-mux down session2   # 最後のセッション停止 → デーモンも自動停止
```

### 3. 動作モードの整理

| シナリオ | ttyd | tmux | daemon |
|---------|------|------|--------|
| `down session` | 停止 | 残存 | 稼働継続（他セッションあれば） |
| `down session --kill-tmux` | 停止 | 終了 | 稼働継続（他セッションあれば） |
| `down` (最後のセッション) | 停止 | 残存 | 自動停止 |
| `down --kill-tmux` (最後) | 停止 | 終了 | 自動停止 |
| `daemon stop` | 全停止 | 残存 | 停止 |

## Consequences

### Positive

- **完全なクリーンアップ**: `--kill-tmux` で tmux セッションも終了
- **リソース効率**: 全セッション終了後にデーモンも自動停止
- **tmux との共存**: デフォルトでは tmux セッションを残し、再接続可能
- **明示的な制御**: オプションで挙動を選択可能

### Negative

- **意図しない終了**: 最後のセッション停止でデーモンが終了する
  - → `daemon start` で明示的に起動しておけば回避可能
- **tmux セッション残存**: デフォルトでは tmux が残るため、手動クリーンアップが必要な場合がある

### Neutral

- **後方互換性**: デフォルト動作（tmux 残存）は変更なし

## Notes

### ユースケース別の推奨

| ユースケース | 推奨コマンド |
|-------------|-------------|
| 一時的な中断、後で再開 | `ttyd-mux down session` |
| 完全な終了、クリーンアップ | `ttyd-mux down session --kill-tmux` |
| デーモンを常時稼働させたい | `ttyd-mux daemon start` を先に実行 |

### プロセス終了の流れ

```
1. ttyd-mux down --kill-tmux
2. → API: POST /sessions/:name/stop?killTmux=true
3. → SessionManager.stopSession()
4.   → kill(ttyd.pid, SIGTERM)
5.   → tmuxClient.killSession(name)
6.   → state から削除
7.   → 残りセッション = 0 なら process.exit(0)
```

### 関連コミット

- `e49045c feat: auto-stop daemon when last session is stopped`
- `ce09cea feat: add --kill-tmux option to terminate tmux sessions on stop`
- `f5a7cfd docs: document session lifecycle and process relationships`

### 関連 ADR

- ADR 006: tmux Auto Creation Mode - tmux セッションの作成モード
- ADR 022: CLI Command Structure - up/down コマンド
