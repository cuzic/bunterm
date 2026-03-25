# ADR 042: OSC 633 シェル統合戦略

## Status

Accepted

## Context

Persistent モードでコマンドの開始・終了を検出するため、OSC 633 (Shell Integration) プロトコルを使用する。

### OSC 633 とは

VS Code が定義したターミナルシェル統合プロトコル。シェルがコマンド実行のライフサイクルをターミナルに通知する：

| シーケンス | 意味 | タイミング |
|-----------|------|-----------|
| `\x1b]633;A\x07` | プロンプト開始 | PS1 の前 |
| `\x1b]633;B\x07` | プロンプト終了 | コマンド入力前 |
| `\x1b]633;C\x07` | コマンド実行開始 | Enter 後 |
| `\x1b]633;D;exitCode\x07` | コマンド実行終了 | コマンド完了後 |
| `\x1b]633;E;command\x07` | コマンド内容 | 実行前 |
| `\x1b]633;P;key=value\x07` | プロパティ設定 | 任意 |

### 課題

1. **環境依存**: ユーザーのシェル設定に依存
2. **失敗モード**: マーカーが出力されない、遅延する、破損する
3. **常駐シェルの複雑さ**: 対話的入力との混在

## Decision

**OSC 633 セルフテスト + 汚染検出**を実装する。

### セルフテスト

セッション作成直後に OSC 633 の動作を確認：

```typescript
async function testIntegration(): Promise<IntegrationStatus> {
  const testId = `__MARKER_TEST_${Date.now()}__`;
  session.write(`echo ${testId}\n`);

  // 2 秒以内に OSC 633;D を検出できるか
  const result = await waitForMarker(session, MARKER_TIMEOUT_MS);

  return {
    osc633: result.detected,
    shellType: result.shellType,  // 'zsh' | 'bash' | 'fish' | 'unknown'
    testedAt: new Date().toISOString(),
    status: result.detected ? 'healthy' : 'error',
    errorReason: result.error
  };
}
```

### シェル統合スクリプト

各シェル用の統合スクリプトを提供：

**bash.sh:**
```bash
__ttyd_mux_preexec() {
    printf '\033]633;C\007'
}

__ttyd_mux_precmd() {
    local exit_code=$?
    printf '\033]633;D;%s\007' "$exit_code"
    printf '\033]633;A\007'
}

trap '__ttyd_mux_preexec' DEBUG
PROMPT_COMMAND="__ttyd_mux_precmd${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
```

**zsh.sh:**
```zsh
__ttyd_mux_preexec() {
    print -Pn '\033]633;C\007'
}

__ttyd_mux_precmd() {
    print -Pn '\033]633;D;%?\007'
    print -Pn '\033]633;A\007'
}

autoload -Uz add-zsh-hook
add-zsh-hook preexec __ttyd_mux_preexec
add-zsh-hook precmd __ttyd_mux_precmd
```

### 汚染セッション検出

タイムアウトやキャンセル後、セッションの状態が不確定になる：

```typescript
interface IntegrationStatus {
  osc633: boolean;
  shellType: 'zsh' | 'bash' | 'fish' | 'unknown';
  testedAt: string;
  status: 'healthy' | 'contaminated' | 'error';
  errorReason?: string;
}

// タイムアウト/キャンセル後
if (session.mode === 'persistent') {
  this.integrationStatus.status = 'contaminated';
}
```

### フォールバック戦略

OSC 633 が利用できない場合：

1. **Ephemeral モードを推奨**: `mode: 'ephemeral'` で OSC 633 不要
2. **将来**: MarkerProvider 抽象化で別プロトコル対応

```
┌─────────────────────────────────────────────┐
│              MarkerProvider                  │
├─────────────────────────────────────────────┤
│  OSC633Provider   │  OSC133Provider  │ ...  │
│  (VS Code 互換)   │  (iTerm2 互換)   │      │
└─────────────────────────────────────────────┘
```

### Integration 状態 API

```
GET /api/sessions/:name/integration

{
  "osc633": true,
  "shellType": "zsh",
  "testedAt": "2026-03-01T10:00:00Z",
  "status": "healthy"
}
```

## Consequences

### Positive

- **信頼性向上**: セルフテストで事前に検出
- **明確なフォールバック**: Ephemeral モードで OSC 633 不要
- **汚染検知**: 不確定状態を API で可視化
- **将来の拡張**: MarkerProvider で他プロトコル対応可能

### Negative

- **初期化遅延**: セルフテストに最大 2 秒
- **シェル設定依存**: ユーザーが統合スクリプトを読み込む必要
- **汚染時の制限**: 新セッション作成が必要

### OSC 633 の限界

| 状況 | 問題 | 対策 |
|------|------|------|
| シェル未設定 | マーカー出力なし | セルフテストで検出 |
| 非対話的コマンド | マーカー遅延 | タイムアウト |
| Ctrl+C 中断 | 状態不確定 | 汚染フラグ |
| サブシェル | マーカー重複 | correlation ID |

## Implementation Details

### マーカー検出

```typescript
// OSC 633;D を検出
const OSC_633_D = /\x1b\]633;D(?:;(\d+))?\x07/;

function parseOsc633D(data: string): number | null {
  const match = data.match(OSC_633_D);
  if (!match) return null;
  return match[1] ? parseInt(match[1], 10) : 0;
}
```

### タイムアウト処理

```typescript
const MARKER_TIMEOUT_MS = 2000;

async function waitForMarker(session: TerminalSession, timeoutMs: number): Promise<MarkerResult> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ detected: false, error: 'Marker timeout' });
    }, timeoutMs);

    const checkOutput = (data: string) => {
      if (data.includes('\x1b]633;D')) {
        clearTimeout(timeout);
        resolve({ detected: true, shellType: detectShellType() });
      }
    };

    // Poll session output buffer
    const poll = setInterval(() => {
      for (const item of session.getOutputBuffer()) {
        checkOutput(Buffer.from(item, 'base64').toString('utf-8'));
      }
    }, 100);

    setTimeout(() => clearInterval(poll), timeoutMs + 100);
  });
}
```

## References

- [VS Code Shell Integration](https://code.visualstudio.com/docs/terminal/shell-integration)
- [OSC 133 (iTerm2)](https://iterm2.com/documentation-escape-codes.html)
- [ADR 039: Command Block API Architecture](./039-command-block-api-architecture.md)
