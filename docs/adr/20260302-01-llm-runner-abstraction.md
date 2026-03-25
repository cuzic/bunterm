# ADR 046: LLM Runner 抽象化（Claude/Codex/Gemini CLI 対応）

## Status

Proposed

## Context

AI チャット連携を実装する際、以下の制約がある：

1. **OAuth 定額枠の制限**: API を直接叩くのではなく、ユーザーの定額プラン（Claude Pro 等）を活用したい
2. **複数 LLM 対応**: Claude だけでなく Codex CLI、Gemini CLI も使いたい
3. **規約遵守**: 定額枠を自動化で消耗しすぎると規約違反になりうる

### 設計原則

> **AI チャットの実体を「LLM API」ではなく「CLI Runner」に抽象化する**

各 CLI（Claude Code / Codex CLI / Gemini CLI）が提供する認証・課金の仕組みをそのまま使い、
アプリ側は「CLI を起動して標準入出力を読む」だけにする。

## Decision

**Runner 抽象 + CLI 差し替え可能アーキテクチャ**を採用する。

### アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Browser (React)                            │
├─────────────────────────────────────────────────────────────────────┤
│  AIChatPane                                                          │
│  ├─ ContextTray (選択ブロック)                                       │
│  ├─ ChatThread                                                       │
│  ├─ RunnerSelector: [Claude | Codex | Gemini | Auto]                │
│  └─ ChatInput                                                        │
└─────────────────────────────────────────────────────────────────────┘
         │ POST /api/ai/runs
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         AI Gateway (Server)                          │
├─────────────────────────────────────────────────────────────────────┤
│  ├─ RunManager                                                       │
│  │   ├─ プロンプト構築（ブロック引用レンダリング）                    │
│  │   ├─ キャッシュチェック                                           │
│  │   └─ スロットリング                                               │
│  │                                                                   │
│  ├─ Runner (差し替え可能)                                            │
│  │   ├─ ClaudeRunner (claude -p / claude code)                      │
│  │   ├─ CodexRunner (codex ...)                                     │
│  │   ├─ GeminiRunner (gemini ...)                                   │
│  │   └─ DisabledRunner (オフライン用)                               │
│  │                                                                   │
│  └─ ResponseParser                                                   │
│      ├─ JSON 抽出                                                    │
│      ├─ citations 抽出                                               │
│      └─ nextCommands 抽出                                            │
├─────────────────────────────────────────────────────────────────────┤
│                      Terminal Server (既存)                          │
│  └─ Runner が CLI を起動する際に使用                                 │
└─────────────────────────────────────────────────────────────────────┘
```

### Runner インターフェース

```typescript
interface Runner {
  readonly name: string;  // 'claude' | 'codex' | 'gemini'
  readonly displayName: string;

  // CLI の存在・認証状態を確認
  checkAvailability(): Promise<RunnerStatus>;

  // 能力を返す
  capabilities(): RunnerCapabilities;

  // 実行
  run(request: RunRequest): Promise<RunResult>;

  // ストリーミング（対応している場合）
  stream?(request: RunRequest): AsyncIterable<RunChunk>;

  // キャンセル
  cancel?(runId: string): Promise<void>;
}

interface RunnerStatus {
  available: boolean;
  version?: string;
  authenticated: boolean;
  quotaInfo?: string;  // "Pro plan" など
  error?: string;
}

interface RunnerCapabilities {
  supportsStreaming: boolean;
  supportsJsonMode: boolean;
  supportsTools: boolean;
  maxInputHint: number;     // 推定最大入力文字数
  typicalLatencyMs: number; // 典型的なレイテンシ
}

interface RunRequest {
  prompt: string;
  expectedSchema?: object;  // JSON スキーマ
  timeoutMs?: number;
  cwd?: string;
  env?: Record<string, string>;
}

interface RunResult {
  runId: string;
  rawText: string;
  parsedJson?: unknown;
  citations?: string[];     // blockId[]
  nextCommands?: SuggestedCommand[];
  durationMs: number;
  cached: boolean;
}
```

### CLI 起動例

#### Claude Runner

```typescript
class ClaudeRunner implements Runner {
  async run(request: RunRequest): Promise<RunResult> {
    // claude -p でプロンプト実行
    const proc = Bun.spawn(['claude', '-p', request.prompt], {
      cwd: request.cwd,
      env: { ...process.env, ...request.env },
      stdout: 'pipe',
      stderr: 'pipe'
    });

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    return this.parseResult(stdout);
  }
}
```

#### Codex Runner

```typescript
class CodexRunner implements Runner {
  async run(request: RunRequest): Promise<RunResult> {
    // codex --prompt でプロンプト実行
    const proc = Bun.spawn(['codex', '--prompt', request.prompt, '--json'], {
      cwd: request.cwd,
      stdout: 'pipe'
    });

    const stdout = await new Response(proc.stdout).text();
    return this.parseResult(stdout);
  }
}
```

#### Gemini Runner

```typescript
class GeminiRunner implements Runner {
  async run(request: RunRequest): Promise<RunResult> {
    // gemini CLI で実行
    const proc = Bun.spawn(['gemini', 'prompt', request.prompt], {
      cwd: request.cwd,
      stdout: 'pipe'
    });

    const stdout = await new Response(proc.stdout).text();
    return this.parseResult(stdout);
  }
}
```

### プロンプトレンダリング（共通）

```typescript
class ContextRenderer {
  render(blocks: ExtendedBlock[], mode: RenderMode): string {
    const lines: string[] = [];

    lines.push('# Terminal Context');
    lines.push('');

    for (const block of blocks) {
      lines.push(this.renderBlock(block, mode));
      lines.push('');
    }

    lines.push('# Instructions');
    lines.push('- Respond in JSON format only');
    lines.push('- Include "citations" array with blockIds you referenced');
    lines.push('- Include "nextCommands" array with suggested commands');
    lines.push('- Do NOT execute any commands, only suggest them');

    return lines.join('\n');
  }

  private renderBlock(block: ExtendedBlock, mode: RenderMode): string {
    const header = [
      `## Block ${block.id} (seq=${block.seq ?? 'N/A'})`,
      `Command: ${block.command}`,
      `CWD: ${block.effectiveCwd ?? 'N/A'}`,
      `Exit: ${block.exitCode} (${block.status})`,
      `Duration: ${block.durationMs ? (block.durationMs / 1000).toFixed(1) + 's' : 'N/A'}`
    ].join('\n');

    if (mode === 'errorOnly') {
      // 失敗ブロックは stderr 中心
      if (block.status === 'error' || block.status === 'timeout') {
        return `${header}\n\n### stderr\n\`\`\`\n${block.stderrPreview || '(empty)'}\n\`\`\``;
      }
      // 成功ブロックはヘッダのみ
      return header;
    }

    // preview モード
    let output = header;
    if (block.stderrPreview) {
      output += `\n\n### stderr (preview)\n\`\`\`\n${block.stderrPreview}\n\`\`\``;
    }
    if (block.stdoutPreview) {
      output += `\n\n### stdout (preview)\n\`\`\`\n${block.stdoutPreview}\n\`\`\``;
    }
    return output;
  }
}
```

### キャッシュ

```typescript
class RunCache {
  private cache: Map<string, CachedRun> = new Map();
  private readonly maxAge = 1000 * 60 * 60; // 1 hour

  getCacheKey(request: AIChatRequest): string {
    return crypto.createHash('sha256')
      .update(JSON.stringify({
        question: request.question,
        context: request.context,
        runner: request.runner
      }))
      .digest('hex');
  }

  get(key: string): RunResult | undefined {
    const cached = this.cache.get(key);
    if (!cached) return undefined;
    if (Date.now() - cached.timestamp > this.maxAge) {
      this.cache.delete(key);
      return undefined;
    }
    return { ...cached.result, cached: true };
  }

  set(key: string, result: RunResult): void {
    this.cache.set(key, {
      result,
      timestamp: Date.now()
    });
  }
}
```

### スロットリング

```typescript
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly maxRequests = 10;
  private readonly windowMs = 60 * 1000; // 1 minute

  canProceed(userId: string): boolean {
    const now = Date.now();
    const userRequests = this.requests.get(userId) ?? [];

    // 古いリクエストを削除
    const recent = userRequests.filter(t => now - t < this.windowMs);

    if (recent.length >= this.maxRequests) {
      return false;
    }

    recent.push(now);
    this.requests.set(userId, recent);
    return true;
  }
}
```

### JSON 抽出（フォールバック付き）

```typescript
class ResponseParser {
  parse(rawText: string): ParsedResponse {
    // 1. 最初の JSON オブジェクトを抽出
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          success: true,
          data: parsed,
          citations: parsed.citations ?? [],
          nextCommands: parsed.nextCommands ?? []
        };
      } catch (e) {
        // JSON パース失敗
      }
    }

    // 2. フォールバック: citations を正規表現で抽出
    const citations = this.extractCitations(rawText);
    const nextCommands = this.extractNextCommands(rawText);

    return {
      success: false,
      rawText,
      citations,
      nextCommands
    };
  }

  private extractCitations(text: string): string[] {
    const matches = text.matchAll(/block[_\s]?(\w+)/gi);
    return [...matches].map(m => m[1]);
  }

  private extractNextCommands(text: string): SuggestedCommand[] {
    // コードブロック内のコマンドを抽出
    const codeBlocks = text.matchAll(/```(?:bash|sh)?\n([\s\S]*?)```/g);
    return [...codeBlocks].map(m => ({
      command: m[1].trim(),
      description: 'Suggested command',
      risk: 'moderate' as const
    }));
  }
}
```

### Runner 選択 UI

```typescript
// components/RunnerSelector.tsx
interface RunnerSelectorProps {
  available: RunnerStatus[];
  selected: string;
  onSelect: (runner: string) => void;
}

export function RunnerSelector({ available, selected, onSelect }: RunnerSelectorProps) {
  return (
    <div className="runner-selector">
      <label>Run with:</label>
      <select value={selected} onChange={e => onSelect(e.target.value)}>
        <option value="auto">Auto (Best Available)</option>
        {available.filter(r => r.available).map(r => (
          <option key={r.name} value={r.name}>
            {r.displayName} {r.quotaInfo && `(${r.quotaInfo})`}
          </option>
        ))}
      </select>
    </div>
  );
}
```

### コンテキスト量の見積もり表示

```typescript
// components/ContextEstimate.tsx
export function ContextEstimate({ blocks, renderMode }: ContextEstimateProps) {
  const renderer = new ContextRenderer();
  const rendered = renderer.render(blocks, renderMode);
  const charCount = rendered.length;
  const tokenEstimate = Math.ceil(charCount / 4); // 概算

  return (
    <div className="context-estimate">
      <span>Context: {blocks.length} blocks / ~{charCount.toLocaleString()} chars</span>
      {charCount > 10000 && (
        <span className="warning">
          ⚠️ Large context. Consider using "Error Only" mode.
        </span>
      )}
    </div>
  );
}
```

## Consequences

### Positive

- **複数 LLM 対応**: Claude/Codex/Gemini を同一 UI で使用可能
- **定額枠活用**: 各 CLI の認証・課金を直接利用、API コスト削減
- **規約遵守**: CLI 経由で公式に許可された方法で利用
- **フォールバック**: CLI が使えない場合は API に切り替え可能
- **キャッシュ**: 同じ入力には同じ結果を返し、枠消耗を抑制

### Negative

- **CLI 依存**: 各 CLI のインストール・認証が前提
- **出力の不安定さ**: CLI ごとに出力形式が異なる
- **ストリーミング制限**: CLI によっては非対応

### 規約・運用上の注意

- **自動化しすぎない**: 人間の確認を挟む設計に
- **大量ジョブを並列に回さない**: スロットリングで制御
- **API フォールバック**: 企業利用や安定運用には API モードも用意

## Implementation Plan

### Phase 1: Runner 基盤

1. Runner インターフェース定義
2. ClaudeRunner 実装
3. ResponseParser（JSON 抽出）
4. キャッシュ・スロットリング

### Phase 2: 追加 Runner

1. CodexRunner 実装
2. GeminiRunner 実装
3. Runner 可用性チェック UI

### Phase 3: UI 統合

1. RunnerSelector コンポーネント
2. ContextEstimate 表示
3. nextCommands → Terminal Server 連携

## References

- [ADR 045: AI Chat Block Context](./045-ai-chat-block-context.md)
- [Claude Code Docs](https://code.claude.com/docs/en/how-claude-code-works)
- [Codex CLI](https://developers.openai.com/codex/cli/)
- [Gemini CLI](https://developers.google.com/gemini-code-assist/docs/gemini-cli)
