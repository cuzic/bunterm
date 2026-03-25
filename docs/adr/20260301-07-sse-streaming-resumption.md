# ADR 043: SSE ストリーミングと Last-Event-ID 再開

## Status

Accepted

## Context

Command Block API でコマンド出力をリアルタイム配信する際、以下の要件がある：

1. **リアルタイム性**: 出力発生と同時にクライアントへ配信
2. **再開可能性**: ネットワーク切断後に途中から再取得
3. **バッファリング**: 接続前の出力も取得可能
4. **効率性**: ポーリングより低レイテンシ

### 選択肢

| 方式 | リアルタイム | 再開可能 | 実装複雑度 |
|------|------------|---------|-----------|
| Polling | ✗ | ✓ | 低 |
| WebSocket | ✓ | △ (自前実装) | 中 |
| SSE + Last-Event-ID | ✓ | ✓ (標準) | 中 |
| gRPC Streaming | ✓ | △ | 高 |

## Decision

**SSE (Server-Sent Events) + Last-Event-ID**を採用する。

### イベント形式

```
event: block.started
id: 1
data: {"blockId":"block_123","command":"npm test","mode":"ephemeral"}

event: block.stdout
id: 2
data: {"blockId":"block_123","seq":2,"content":"VGVzdGluZy4uLg=="}

event: block.stderr
id: 5
data: {"blockId":"block_123","seq":5,"content":"V2FybmluZzog..."}

event: block.completed
id: 10
data: {"blockId":"block_123","exitCode":0,"durationMs":1234}
```

### シーケンス番号

全イベントにグローバル seq を付与：

```typescript
interface BlockEvent {
  seq: number;           // グローバル単調増加
  type: BlockEventType;
  blockId: string;
  data: any;
  timestamp: string;
}

type BlockEventType =
  | 'block.started'
  | 'block.stdout'
  | 'block.stderr'
  | 'block.completed'
  | 'block.canceled'
  | 'block.error';
```

### Last-Event-ID による再開

```typescript
// クライアント
const eventSource = new EventSource('/api/blocks/block_123/stream');
// 切断後、ブラウザは自動的に Last-Event-ID ヘッダを付けて再接続

// サーバー
app.get('/api/blocks/:blockId/stream', (req, res) => {
  const lastEventId = req.headers['last-event-id'];
  const fromSeq = lastEventId ? parseInt(lastEventId, 10) : 0;

  // fromSeq より大きい seq のイベントを送信
  const pastEvents = eventEmitter.getEventsSince(blockId, fromSeq);
  for (const event of pastEvents) {
    sendSSE(res, event);
  }

  // 以降はリアルタイムで送信
  const unsubscribe = eventEmitter.subscribe(blockId, (event) => {
    sendSSE(res, event);
  });
});
```

### BlockEventEmitter

```typescript
class BlockEventEmitter {
  private events: Map<string, BlockEvent[]> = new Map();  // blockId -> events
  private listeners: Map<string, Set<BlockEventListener>> = new Map();
  private globalSeq = 0;

  // イベント発火（保存 + 配信）
  emit(blockId: string, type: BlockEventType, data: any): BlockEvent {
    const event: BlockEvent = {
      seq: ++this.globalSeq,
      type,
      blockId,
      data,
      timestamp: new Date().toISOString()
    };

    // 保存（再接続用）
    this.storeEvent(blockId, event);

    // リスナーに配信
    const listeners = this.listeners.get(blockId);
    if (listeners) {
      for (const listener of listeners) {
        listener(event);
      }
    }

    return event;
  }

  // 購読
  subscribe(
    blockId: string,
    listener: BlockEventListener,
    options?: { fromSeq?: number }
  ): () => void {
    // 過去イベントを送信
    if (options?.fromSeq !== undefined) {
      const past = this.getEventsSince(blockId, options.fromSeq);
      for (const event of past) {
        listener(event);
      }
    }

    // リアルタイム購読
    const listeners = this.listeners.get(blockId) ?? new Set();
    listeners.add(listener);
    this.listeners.set(blockId, listeners);

    return () => listeners.delete(listener);
  }
}
```

### API エンドポイント

```
GET /api/blocks/:blockId/stream
Headers:
  Accept: text/event-stream
  Last-Event-ID: 42  (オプション)

Response:
  Content-Type: text/event-stream
  Cache-Control: no-cache
  Connection: keep-alive
```

### 差分取得 API（補助）

SSE が使えない環境向けにポーリング API も提供：

```
GET /api/blocks/:blockId/chunks?fromSeq=42&limit=100

{
  "chunks": [
    { "seq": 43, "stream": "stdout", "content": "..." },
    { "seq": 44, "stream": "stdout", "content": "..." }
  ],
  "hasMore": false
}
```

## Consequences

### Positive

- **標準準拠**: HTTP/1.1 標準、特別なクライアントライブラリ不要
- **自動再接続**: EventSource が自動的に再接続
- **再開可能**: Last-Event-ID で途中から復帰
- **シンプル**: WebSocket より軽量
- **プロキシ互換**: HTTP/1.1 を通すプロキシで動作

### Negative

- **単方向**: サーバー → クライアントのみ（入力は別途 POST）
- **接続数制限**: ブラウザは同一ドメインで 6 接続まで（HTTP/1.1）
- **テキストのみ**: バイナリは Base64 エンコード必要

### 制限事項

- **イベント保持**: コマンド完了後一定時間でイベント破棄
- **同時接続**: 1 ブロックあたり最大 10 クライアント程度を想定

## Implementation Details

### SSE フォーマット関数

```typescript
function formatSSEEvent(event: BlockEvent): string {
  const lines: string[] = [];
  lines.push(`event: ${event.type}`);
  lines.push(`id: ${event.seq}`);
  lines.push(`data: ${JSON.stringify({
    blockId: event.blockId,
    ...event.data
  })}`);
  lines.push('');  // 空行で終了
  return lines.join('\n');
}
```

### ReadableStream 生成

```typescript
function createBlockSSEStream(
  emitter: BlockEventEmitter,
  blockId: string,
  fromSeq?: number
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      const unsubscribe = emitter.subscribe(
        blockId,
        (event) => {
          const sse = formatSSEEvent(event);
          controller.enqueue(encoder.encode(sse));
        },
        { fromSeq }
      );

      // コネクション終了時にクリーンアップ
      controller.signal?.addEventListener('abort', unsubscribe);
    }
  });
}
```

### HTTP ハンドラ

```typescript
if (path === `/api/blocks/${blockId}/stream`) {
  const lastEventId = request.headers.get('last-event-id');
  const fromSeq = lastEventId ? parseInt(lastEventId, 10) : undefined;

  const stream = createBlockSSEStream(eventEmitter, blockId, fromSeq);

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}
```

## References

- [MDN: Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [HTML Living Standard: EventSource](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [ADR 039: Command Block API Architecture](./039-command-block-api-architecture.md)
