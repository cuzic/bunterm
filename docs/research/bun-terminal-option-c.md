# Bun.Terminal API と Option C 詳細

調査日: 2026-03-01

## Bun.Terminal API 概要

Bun v1.3.5 (2025-12-17) で追加された組み込み PTY (擬似端末) API。
外部依存なしでインタラクティブなターミナルアプリケーションを実行できる。

### 基本的な使用方法

```typescript
const proc = Bun.spawn(["bash"], {
  terminal: {
    cols: 80,
    rows: 24,
    data(terminal, data) {
      // PTY からの出力を受信
      console.log("Output:", data);
    },
  },
});

// ターミナルに入力を送信
proc.terminal.write("echo hello\n");

// プロセス終了を待機
await proc.exited;

// ターミナルをクローズ
proc.terminal.close();
```

### Terminal オプション

| オプション | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `cols` | `number` | `80` | カラム数 |
| `rows` | `number` | `24` | 行数 |
| `name` | `string` | `"xterm-256color"` | ターミナルタイプ |
| `data` | `(terminal, data) => void` | - | 出力受信コールバック |
| `exit` | `(terminal, exitCode, signal) => void` | - | PTY クローズ時コールバック |
| `drain` | `(terminal) => void` | - | 書き込み可能時コールバック |

### Terminal メソッド

```typescript
interface Terminal {
  // 入力を送信
  write(data: string | BufferSource): number;

  // サイズ変更
  resize(cols: number, rows: number): void;

  // Raw モード (行バッファリング無効化)
  setRawMode(enabled: boolean): void;

  // イベントループ参照制御
  ref(): void;
  unref(): void;

  // クローズ
  close(): void;

  // プロパティ
  readonly stdin: number;   // stdin ファイルディスクリプタ
  readonly stdout: number;  // stdout ファイルディスクリプタ
  readonly closed: boolean; // クローズ状態
}
```

### 再利用可能な Terminal

```typescript
// Terminal を独立して作成し、複数プロセスで再利用
await using terminal = new Bun.Terminal({
  cols: 80,
  rows: 24,
  data(term, data) {
    process.stdout.write(data);
  },
});

// 最初のプロセス
const proc1 = Bun.spawn(["echo", "first"], { terminal });
await proc1.exited;

// 同じターミナルで次のプロセス
const proc2 = Bun.spawn(["echo", "second"], { terminal });
await proc2.exited;

// `await using` により自動クローズ
```

### 制限事項

- **POSIX のみ**: Linux, macOS で動作。Windows は非対応。
- **terminal オプション使用時**:
  - `proc.stdin`, `proc.stdout`, `proc.stderr` は `null` を返す
  - 代わりに `proc.terminal` を使用

---

## Option C: ttyd 置換アーキテクチャ

### 概要

ttyd プロセスを廃止し、Bun.Terminal で直接 PTY を管理する。
WebSocket サーバーも ttyd-mux 内に統合。

```
┌────────────────────────────────────────────────────────────────────┐
│  Browser                                                           │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  xterm.js                                                    │ │
│  │  - WebSocket 接続                                            │ │
│  │  - terminal-ui.js (AI UI)                                    │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                          │ WebSocket (カスタムプロトコル)          │
└──────────────────────────┼─────────────────────────────────────────┘
                           │
┌──────────────────────────┼─────────────────────────────────────────┐
│  ttyd-mux daemon         │                                         │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  WebSocket Server (Bun native)                               │ │
│  │  - 接続管理                                                   │ │
│  │  - プロトコル処理                                             │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                          │                                         │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  Session Manager                                             │ │
│  │  - Bun.Terminal インスタンス管理                              │ │
│  │  - 出力バッファ (AI 用)                                       │ │
│  │  - コマンド履歴                                               │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                          │                                         │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  AI Processor                                                │ │
│  │  - 入力インターセプト (`#` 検知)                              │ │
│  │  - エラー検知・分析                                           │ │
│  │  - LLM API 呼び出し                                          │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                          │ PTY                                     │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  Bun.Terminal                                                │ │
│  │  - PTY 作成・管理                                            │ │
│  │  - tmux / bash / etc.                                        │ │
│  └──────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

### 実装設計

#### 1. WebSocket プロトコル

ttyd 互換プロトコル (既存クライアントとの互換性維持):

```typescript
// コマンドコード
const CMD = {
  INPUT: 0x30,           // '0' - クライアント→サーバー: 入力
  OUTPUT: 0x31,          // '1' - サーバー→クライアント: 出力
  RESIZE: 0x32,          // '2' - クライアント→サーバー: リサイズ
  SET_TITLE: 0x33,       // '3' - サーバー→クライアント: タイトル
  SET_PREFS: 0x34,       // '4' - サーバー→クライアント: 設定
  PAUSE: 0x35,           // '5' - クライアント→サーバー: 一時停止
  RESUME: 0x36,          // '6' - クライアント→サーバー: 再開
  JSON_DATA: 0x37,       // '7' - 初期化データ

  // AI 拡張 (オプション)
  AI_REQUEST: 0x40,      // 'A' - AI リクエスト
  AI_RESPONSE: 0x41,     // 'B' - AI レスポンス
  AI_SUGGEST: 0x42,      // 'C' - AI 提案
  BUFFER_REQUEST: 0x43,  // 'D' - バッファ要求
  BUFFER_RESPONSE: 0x44, // 'E' - バッファ応答
} as const;
```

#### 2. TerminalSession クラス

```typescript
interface TerminalSessionOptions {
  name: string;
  cols: number;
  rows: number;
  cwd: string;
  command: string[];
  env?: Record<string, string>;
}

class TerminalSession {
  private terminal: Bun.Terminal;
  private proc: Subprocess;
  private clients: Set<WebSocket> = new Set();
  private outputBuffer: RingBuffer;
  private commandHistory: string[] = [];

  constructor(options: TerminalSessionOptions) {
    this.outputBuffer = new RingBuffer(100 * 1024); // 100KB

    this.terminal = new Bun.Terminal({
      cols: options.cols,
      rows: options.rows,
      data: (term, data) => this.handleOutput(data),
      exit: (term, code, signal) => this.handleExit(code, signal),
    });

    this.proc = Bun.spawn(options.command, {
      terminal: this.terminal,
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
    });
  }

  // PTY 出力を処理
  private handleOutput(data: Uint8Array): void {
    // バッファに蓄積 (AI 用)
    this.outputBuffer.write(data);

    // 全クライアントに配信
    const message = Buffer.concat([
      Buffer.from([CMD.OUTPUT]),
      Buffer.from(data)
    ]);

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  // クライアントからの入力を処理
  handleInput(data: Buffer, client: WebSocket): void {
    const text = data.toString('utf-8');

    // AI コマンド検知
    if (text.startsWith('#')) {
      this.handleAiCommand(text.slice(1), client);
      return;
    }

    // 通常入力を PTY に送信
    this.terminal.write(text);

    // Enter キーでコマンド履歴に追加
    if (text.includes('\r') || text.includes('\n')) {
      this.recordCommand(text);
    }
  }

  // リサイズ処理
  resize(cols: number, rows: number): void {
    this.terminal.resize(cols, rows);
  }

  // ターミナルバッファ取得 (AI 用)
  getOutputBuffer(): string {
    return this.outputBuffer.toString();
  }

  // コマンド履歴取得
  getCommandHistory(): string[] {
    return [...this.commandHistory];
  }

  // クリーンアップ
  async destroy(): Promise<void> {
    this.proc.kill();
    await this.proc.exited;
    this.terminal.close();
    this.clients.clear();
  }
}
```

#### 3. AI Processor

```typescript
interface AiProcessorOptions {
  apiKey: string;
  model: string;
  maxTokens: number;
}

class AiProcessor {
  private client: Anthropic;

  constructor(options: AiProcessorOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey });
  }

  // 自然言語 → コマンド変換
  async translateCommand(
    naturalLanguage: string,
    context: {
      cwd: string;
      recentOutput: string;
      commandHistory: string[];
    }
  ): Promise<string> {
    const response = await this.client.messages.create({
      model: this.options.model,
      max_tokens: 256,
      system: `You are a shell command translator. Convert natural language to shell commands.
Current directory: ${context.cwd}
Recent terminal output (last 50 lines):
${context.recentOutput.split('\n').slice(-50).join('\n')}
Recent commands: ${context.commandHistory.slice(-10).join(', ')}`,
      messages: [{
        role: 'user',
        content: `Translate to a shell command (respond with ONLY the command, no explanation): ${naturalLanguage}`
      }]
    });

    return response.content[0].text.trim();
  }

  // エラー説明
  async explainError(
    command: string,
    output: string,
    exitCode: number
  ): Promise<string> {
    const response = await this.client.messages.create({
      model: this.options.model,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Explain this error and suggest a fix:
Command: ${command}
Exit code: ${exitCode}
Output:
${output}`
      }]
    });

    return response.content[0].text;
  }

  // コマンド修正提案
  async suggestCorrection(
    failedCommand: string,
    errorOutput: string
  ): Promise<string | null> {
    const response = await this.client.messages.create({
      model: this.options.model,
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: `The command "${failedCommand}" failed with:
${errorOutput}

If there's a simple fix (typo, missing flag, etc.), respond with ONLY the corrected command.
If no simple fix, respond with "NO_SUGGESTION".`
      }]
    });

    const suggestion = response.content[0].text.trim();
    return suggestion === 'NO_SUGGESTION' ? null : suggestion;
  }
}
```

#### 4. WebSocket サーバー

```typescript
import { WebSocketServer } from 'ws';

class TerminalWebSocketServer {
  private wss: WebSocketServer;
  private sessions: Map<string, TerminalSession> = new Map();
  private aiProcessor: AiProcessor;

  constructor(options: { port: number; aiProcessor: AiProcessor }) {
    this.aiProcessor = options.aiProcessor;

    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: 10 * 1024 * 1024 // 10MB
    });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const sessionName = this.extractSessionName(req.url);
    const session = this.sessions.get(sessionName);

    if (!session) {
      ws.close(4004, 'Session not found');
      return;
    }

    session.addClient(ws);

    ws.on('message', async (data: Buffer) => {
      await this.handleMessage(session, ws, data);
    });

    ws.on('close', () => {
      session.removeClient(ws);
    });

    // 初期設定を送信
    this.sendPreferences(ws, session);
  }

  private async handleMessage(
    session: TerminalSession,
    ws: WebSocket,
    data: Buffer
  ): Promise<void> {
    if (data.length === 0) return;

    const cmd = data[0];
    const payload = data.subarray(1);

    switch (cmd) {
      case CMD.INPUT:
        session.handleInput(payload, ws);
        break;

      case CMD.RESIZE:
        const { cols, rows } = JSON.parse(payload.toString());
        session.resize(cols, rows);
        break;

      case CMD.PAUSE:
        session.pause();
        break;

      case CMD.RESUME:
        session.resume();
        break;

      case CMD.JSON_DATA:
        // 初期化データ (認証トークン等)
        this.handleInit(session, ws, payload);
        break;

      case CMD.AI_REQUEST:
        await this.handleAiRequest(session, ws, payload);
        break;

      case CMD.BUFFER_REQUEST:
        this.sendBuffer(session, ws);
        break;
    }
  }

  private async handleAiRequest(
    session: TerminalSession,
    ws: WebSocket,
    payload: Buffer
  ): Promise<void> {
    const request = JSON.parse(payload.toString());

    switch (request.type) {
      case 'translate':
        const command = await this.aiProcessor.translateCommand(
          request.text,
          {
            cwd: session.cwd,
            recentOutput: session.getOutputBuffer(),
            commandHistory: session.getCommandHistory()
          }
        );

        ws.send(Buffer.concat([
          Buffer.from([CMD.AI_RESPONSE]),
          Buffer.from(JSON.stringify({ type: 'command', command }))
        ]));
        break;

      case 'explain':
        const explanation = await this.aiProcessor.explainError(
          request.command,
          request.output,
          request.exitCode
        );

        ws.send(Buffer.concat([
          Buffer.from([CMD.AI_RESPONSE]),
          Buffer.from(JSON.stringify({ type: 'explanation', explanation }))
        ]));
        break;
    }
  }
}
```

### xterm.js との接続

#### クライアント側 (terminal-ui.js)

```typescript
class TerminalClient {
  private ws: WebSocket;
  private terminal: Terminal;
  private attachAddon: AttachAddon;

  constructor(wsUrl: string, terminalElement: HTMLElement) {
    this.terminal = new Terminal({
      cols: 80,
      rows: 24,
      fontSize: 14,
    });

    this.terminal.open(terminalElement);

    // WebSocket 接続
    this.ws = new WebSocket(wsUrl, ['tty']);

    this.ws.onopen = () => {
      // 初期化データ送信
      this.sendInit();
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    // 入力をフック
    this.terminal.onData((data) => {
      this.handleInput(data);
    });

    // リサイズをフック
    this.terminal.onResize(({ cols, rows }) => {
      this.sendResize(cols, rows);
    });
  }

  private handleInput(data: string): void {
    // `#` で始まる場合は AI モード
    if (this.inputBuffer.startsWith('#') && data === '\r') {
      this.requestAiTranslation(this.inputBuffer.slice(1));
      this.inputBuffer = '';
      return;
    }

    // 通常入力
    this.sendInput(data);
  }

  private handleMessage(data: ArrayBuffer): void {
    const buffer = new Uint8Array(data);
    const cmd = buffer[0];
    const payload = buffer.slice(1);

    switch (cmd) {
      case CMD.OUTPUT:
        this.terminal.write(payload);
        break;

      case CMD.SET_TITLE:
        document.title = new TextDecoder().decode(payload);
        break;

      case CMD.AI_RESPONSE:
        this.handleAiResponse(JSON.parse(new TextDecoder().decode(payload)));
        break;

      case CMD.AI_SUGGEST:
        this.showSuggestion(JSON.parse(new TextDecoder().decode(payload)));
        break;
    }
  }

  private sendInput(data: string): void {
    const payload = new TextEncoder().encode(data);
    const message = new Uint8Array(1 + payload.length);
    message[0] = CMD.INPUT;
    message.set(payload, 1);
    this.ws.send(message);
  }

  private sendResize(cols: number, rows: number): void {
    const payload = JSON.stringify({ cols, rows });
    const encoded = new TextEncoder().encode(payload);
    const message = new Uint8Array(1 + encoded.length);
    message[0] = CMD.RESIZE;
    message.set(encoded, 1);
    this.ws.send(message);
  }

  private async requestAiTranslation(text: string): Promise<void> {
    const payload = JSON.stringify({ type: 'translate', text });
    const encoded = new TextEncoder().encode(payload);
    const message = new Uint8Array(1 + encoded.length);
    message[0] = CMD.AI_REQUEST;
    message.set(encoded, 1);
    this.ws.send(message);
  }
}
```

### 移行戦略

#### Phase 1: 並行運用

```
┌─────────────────────────────────────────────────────────────────┐
│  ttyd-mux daemon                                                │
│                                                                 │
│  ┌─────────────────────┐    ┌─────────────────────┐            │
│  │  Legacy Sessions    │    │  Native Sessions    │            │
│  │  (ttyd process)     │    │  (Bun.Terminal)     │            │
│  └─────────────────────┘    └─────────────────────┘            │
│           │                          │                          │
│           ▼                          ▼                          │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Unified Router                                             ││
│  │  - /session/:name → 適切なバックエンドにルーティング         ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

1. 新規セッションは Bun.Terminal で作成 (オプション)
2. 既存の ttyd セッションは引き続き動作
3. 設定で `session_backend: 'native' | 'ttyd'` を選択可能

#### Phase 2: 完全移行

1. 全機能を Bun.Terminal バックエンドで検証
2. ttyd 依存を削除
3. ドキュメント更新

### メリット・デメリット

#### メリット

| 項目 | 説明 |
|------|------|
| **完全な制御** | PTY の全操作が可能 |
| **ターミナル状態アクセス** | 出力バッファを直接保持 |
| **低レイテンシ** | プロセス間通信なし |
| **シンプルな構成** | 単一プロセス |
| **AI 統合容易** | サーバー側で全データにアクセス可能 |
| **拡張プロトコル** | AI 用コマンドを自由に追加 |

#### デメリット

| 項目 | 説明 |
|------|------|
| **開発工数** | ttyd の機能を再実装 |
| **Windows 非対応** | Bun.Terminal が POSIX のみ |
| **xterm.js 統合** | プロトコル実装が必要 |
| **ttyd 機能喪失** | ZMODEM, 一部認証機能など |

### 必要な実装量の見積もり

| コンポーネント | 見積もり | 備考 |
|---------------|---------|------|
| TerminalSession クラス | 中 | Bun.Terminal ラッパー |
| WebSocket サーバー | 中 | 既存 ws-proxy を参考に |
| プロトコル処理 | 小 | ttyd 互換 |
| AI Processor | 中 | LLM API 統合 |
| クライアント拡張 | 小 | 既存 terminal-ui に追加 |
| テスト | 大 | E2E テスト必要 |

**合計**: 2-3 週間 (フルタイム開発の場合)

---

## 参考資料

- [Bun.spawn Terminal API](https://bun.sh/docs/runtime/child-process#terminal-pty-support)
- [Bun v1.3.5 リリースノート](https://bun.sh/blog/bun-v1.3.5)
- [xterm.js 公式](https://xtermjs.org/)
- [@xterm/addon-attach](https://www.npmjs.com/package/@xterm/addon-attach)
- [xterm.js Flow Control](https://xtermjs.org/docs/guides/flowcontrol/)
