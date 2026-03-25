# ADR 041: チャンクベースのブロックストレージ

## Status

Accepted

## Context

Command Block API でコマンド出力を保存する際、以下の課題がある：

1. **大容量出力**: ビルドログやテスト結果で数 MB の出力が発生
2. **ストリーミング**: リアルタイムで出力を配信する必要がある
3. **再開可能性**: 切断後に途中から再取得したい
4. **保持ポリシー**: 古いブロックは圧縮、重要なものは永続化

### 保持の原則

エージェント協調で必要な情報：

1. **直近の作業コンテキスト**: 最新 10-50 ブロック
2. **失敗の系譜**: 同じエラーの頻度、解決履歴
3. **決定の証跡**: 重要な分岐は pinned で残す

不要な情報：

- 古い成功ログ（ビルド成功が延々続くもの）
- 繰り返しの `ls` / `pwd` / `git status`
- 巨大テストログ全文（preview で十分）

## Decision

**メタデータ + チャンク分離アーキテクチャ**を採用する。

### データ構造

```typescript
// ブロックメタデータ（軽量）
interface BlockMetadata {
  block: ExtendedBlock;  // preview のみ含む
  chunkSeqs: number[];   // 所属チャンクの seq 一覧
  compressedAt?: string; // 圧縮済みの場合
}

// 出力チャンク（16KB 単位）
interface OutputChunk {
  id: string;
  blockId: string;
  stream: 'stdout' | 'stderr';
  seq: number;           // グローバル単調増加
  content: string;       // Base64
  timestamp: string;
}

// ブロック本体（preview のみ）
interface ExtendedBlock {
  stdoutPreview: string;   // 先頭 500 文字
  stderrPreview: string;
  stdoutBytes: number;
  stderrBytes: number;
  truncated: boolean;
}
```

### 保持ポリシー

```typescript
const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  // リングバッファ
  maxRecentBlocks: 100,        // セッションごと最新 100

  // 失敗優遇
  maxFailedBlocks: 200,        // 失敗ブロックは別枠で長期保持
  failedRetentionDays: 30,

  // 出力全文の保持
  fullOutputRecentCount: 20,   // 最新 20 件のみ全文保持
  olderBlocksPreviewOnly: true, // それ以前は preview + メタデータのみ

  // pinned
  maxPinnedBlocks: 50          // 上限超えたら古い pin から削除
};
```

### ストレージ階層

```
┌─────────────────────────────────────────────────────┐
│                   BlockStore                         │
├─────────────────────────────────────────────────────┤
│  Hot Storage (In-Memory)                             │
│  ├─ 最新 20 ブロック: full chunks                    │
│  ├─ 21-100 ブロック: metadata + preview のみ         │
│  └─ 100+ ブロック: 自動削除                          │
├─────────────────────────────────────────────────────┤
│  Preserved (In-Memory, 別枠)                         │
│  ├─ 失敗ブロック: 最大 200, 30 日保持                │
│  └─ Pinned: 最大 50, 無期限                         │
└─────────────────────────────────────────────────────┘
```

### API

```typescript
class BlockStore {
  // ブロック作成
  createBlock(sessionName: string, command: string, options?: Partial<ExtendedBlock>): ExtendedBlock;

  // 出力追加（チャンク化 + redaction 自動適用）
  appendOutput(blockId: string, stream: 'stdout' | 'stderr', data: string): OutputChunk[];

  // チャンク取得（ストリーミング用）
  getBlockChunks(blockId: string, options?: {
    fromSeq?: number;      // この seq より大きいものを取得
    stream?: 'stdout' | 'stderr' | 'all';
    limit?: number;
  }): { chunks: OutputChunk[]; hasMore: boolean };

  // ピン操作
  pinBlock(blockId: string): boolean;
  unpinBlock(blockId: string): boolean;

  // 圧縮（チャンク削除、preview 維持）
  compressBlock(blockId: string): boolean;
}
```

### シーケンス番号

全チャンクにグローバル seq を付与：

```
Session A: chunk seq=1, seq=2, seq=3
Session B: chunk seq=4, seq=5
Session A: chunk seq=6, seq=7
```

これにより：
- SSE の Last-Event-ID で再開可能
- クライアントが見逃したチャンクを特定可能
- 順序保証

## Consequences

### Positive

- **スケーラビリティ**: メモリ使用量を制御可能
- **ストリーミング**: チャンク単位でリアルタイム配信
- **再開可能**: seq で途中から再取得
- **効率的**: 古いブロックは preview のみ保持
- **失敗優遇**: デバッグに重要な失敗ログを優先保持

### Negative

- **複雑性**: メタデータとチャンクの分離管理
- **メモリ上限**: 大量セッションでメモリ圧迫の可能性
- **将来の永続化**: 現在は In-Memory のみ（SQLite 等への移行が必要）

### 制限事項

- **1 ブロックあたり最大 1MB**: 超過時は truncated フラグ
- **チャンクサイズ 16KB**: 固定（調整可能）
- **In-Memory のみ**: デーモン再起動でデータ消失

## Implementation Details

### サイズ制限

```typescript
const PREVIEW_SIZE = 500;          // 文字
const MAX_OUTPUT_SIZE = 1024 * 1024; // 1MB
const CHUNK_SIZE = 16 * 1024;       // 16KB
```

### 圧縮処理

```typescript
compressBlock(blockId: string): boolean {
  const metadata = this.blocks.get(blockId);
  if (!metadata || metadata.compressedAt) return false;

  // チャンク削除
  for (const seq of metadata.chunkSeqs) {
    const chunk = this.getChunkBySeq(blockId, seq);
    if (chunk) this.chunks.delete(chunk.id);
  }

  metadata.chunkSeqs = [];
  metadata.compressedAt = new Date().toISOString();
  return true;
}
```

### 自動保持ポリシー適用

ブロック作成時に自動で古いブロックを整理：

```typescript
createBlock(...) {
  // ... ブロック作成 ...

  this.applyRetention(sessionName);  // 自動整理

  return block;
}
```

## References

- [ADR 039: Command Block API Architecture](./039-command-block-api-architecture.md)
- [Ring Buffer Pattern](https://en.wikipedia.org/wiki/Circular_buffer)
