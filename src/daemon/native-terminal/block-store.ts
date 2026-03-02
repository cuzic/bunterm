/**
 * BlockStore - Chunk-based block storage with retention policy
 *
 * Implements:
 * - Metadata + chunk separation
 * - Sequence number management for streaming
 * - Retention policy (ring buffer, failed preservation, pinned)
 * - Automatic compression of old blocks
 */

import { type OutputRedactor, createRedactor } from './output-redactor.js';
import {
  DEFAULT_RETENTION_POLICY,
  type ExtendedBlock,
  type ExtendedBlockStatus,
  type OutputChunk,
  type RetentionPolicy
} from './types.js';

/** Preview size in characters */
const PREVIEW_SIZE = 500;

/** Maximum output size per block (1MB) */
const MAX_OUTPUT_SIZE = 1024 * 1024;

/** Chunk size for splitting output (16KB) */
const CHUNK_SIZE = 16 * 1024;

/**
 * Generate a unique block ID
 */
function generateBlockId(): string {
  return `block_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Generate a unique chunk ID
 */
function generateChunkId(blockId: string, seq: number): string {
  return `chunk_${blockId}_${seq}`;
}

/**
 * Generate a correlation ID
 */
function generateCorrelationId(): string {
  return `corr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Block metadata stored separately from chunks
 */
interface BlockMetadata {
  block: ExtendedBlock;
  chunkSeqs: number[]; // Sequence numbers of chunks belonging to this block
  compressedAt?: string; // If set, full output was removed
}

/**
 * BlockStore manages blocks and their output chunks
 */
export class BlockStore {
  private blocks: Map<string, BlockMetadata> = new Map();
  private chunks: Map<string, OutputChunk> = new Map();
  private blocksBySession: Map<string, string[]> = new Map(); // sessionName -> blockIds
  private globalSeq = 0;
  private readonly retentionPolicy: RetentionPolicy;
  private readonly redactor: OutputRedactor;

  constructor(
    retentionPolicy: RetentionPolicy = DEFAULT_RETENTION_POLICY,
    redactor?: OutputRedactor
  ) {
    this.retentionPolicy = retentionPolicy;
    this.redactor = redactor ?? createRedactor();
  }

  /**
   * Create a new block
   */
  createBlock(
    sessionName: string,
    command: string,
    options: Partial<ExtendedBlock> = {}
  ): ExtendedBlock {
    const id = generateBlockId();
    const correlationId = options.correlationId ?? generateCorrelationId();

    const block: ExtendedBlock = {
      id,
      correlationId,
      command,
      mode: options.mode ?? 'ephemeral',
      submittedVia: options.submittedVia ?? 'api',
      requestedCwd: options.requestedCwd,
      requestedEnv: options.requestedEnv,
      effectiveCwd: options.effectiveCwd,
      gitInfo: options.gitInfo,
      stdoutPreview: '',
      stderrPreview: '',
      stdoutBytes: 0,
      stderrBytes: 0,
      truncated: false,
      status: 'queued',
      startedAt: new Date().toISOString(),
      tags: options.tags,
      agentMeta: options.agentMeta,
      pinned: options.pinned ?? false,
      startLine: options.startLine,
      endLine: options.endLine
    };

    const metadata: BlockMetadata = {
      block,
      chunkSeqs: []
    };

    this.blocks.set(id, metadata);

    // Add to session index
    const sessionBlocks = this.blocksBySession.get(sessionName) ?? [];
    sessionBlocks.push(id);
    this.blocksBySession.set(sessionName, sessionBlocks);

    // Apply retention policy
    this.applyRetention(sessionName);

    return block;
  }

  /**
   * Update block status
   */
  updateStatus(blockId: string, status: ExtendedBlockStatus): void {
    const metadata = this.blocks.get(blockId);
    if (!metadata) return;

    metadata.block.status = status;

    if (status === 'running') {
      metadata.block.startedAt = new Date().toISOString();
    }
  }

  /**
   * Complete a block
   */
  completeBlock(blockId: string, exitCode: number, errorType?: ExtendedBlock['errorType']): void {
    const metadata = this.blocks.get(blockId);
    if (!metadata) return;

    const now = new Date();
    metadata.block.endedAt = now.toISOString();
    metadata.block.exitCode = exitCode;
    metadata.block.errorType = errorType;

    // Calculate duration
    const startTime = new Date(metadata.block.startedAt).getTime();
    metadata.block.durationMs = now.getTime() - startTime;

    // Set final status
    if (errorType === 'timeout') {
      metadata.block.status = 'timeout';
    } else if (errorType === 'canceled') {
      metadata.block.status = 'canceled';
    } else if (exitCode === 0) {
      metadata.block.status = 'success';
    } else {
      metadata.block.status = 'error';
    }
  }

  /**
   * Append output to a block
   * Returns the created chunks with sequence numbers
   */
  appendOutput(blockId: string, stream: 'stdout' | 'stderr', data: string): OutputChunk[] {
    const metadata = this.blocks.get(blockId);
    if (!metadata) return [];

    // Redact sensitive information
    const redactedData = this.redactor.redact(data);

    // Update byte counts
    const bytes = Buffer.byteLength(redactedData, 'utf-8');
    if (stream === 'stdout') {
      metadata.block.stdoutBytes += bytes;
    } else {
      metadata.block.stderrBytes += bytes;
    }

    // Check if we're over the limit
    const totalBytes = metadata.block.stdoutBytes + metadata.block.stderrBytes;
    if (totalBytes > MAX_OUTPUT_SIZE) {
      metadata.block.truncated = true;
      // Don't add more chunks, but still update preview
    }

    // Update preview
    const previewField = stream === 'stdout' ? 'stdoutPreview' : 'stderrPreview';
    if (metadata.block[previewField].length < PREVIEW_SIZE) {
      const remaining = PREVIEW_SIZE - metadata.block[previewField].length;
      metadata.block[previewField] += redactedData.slice(0, remaining);
    }

    // Skip chunk creation if truncated
    if (metadata.block.truncated) {
      return [];
    }

    // Split data into chunks
    const chunks: OutputChunk[] = [];
    let offset = 0;

    while (offset < redactedData.length) {
      const chunkContent = redactedData.slice(offset, offset + CHUNK_SIZE);
      const seq = ++this.globalSeq;

      const chunk: OutputChunk = {
        id: generateChunkId(blockId, seq),
        blockId,
        stream,
        seq,
        content: Buffer.from(chunkContent).toString('base64'),
        timestamp: new Date().toISOString()
      };

      this.chunks.set(chunk.id, chunk);
      metadata.chunkSeqs.push(seq);
      chunks.push(chunk);

      offset += CHUNK_SIZE;
    }

    return chunks;
  }

  /**
   * Get a block by ID
   */
  getBlock(blockId: string): ExtendedBlock | undefined {
    return this.blocks.get(blockId)?.block;
  }

  /**
   * Get all blocks for a session
   */
  getSessionBlocks(sessionName: string): ExtendedBlock[] {
    const blockIds = this.blocksBySession.get(sessionName) ?? [];
    return blockIds
      .map((id) => this.blocks.get(id)?.block)
      .filter((b): b is ExtendedBlock => b !== undefined);
  }

  /**
   * Get chunks for a block
   */
  getBlockChunks(
    blockId: string,
    options: { fromSeq?: number; stream?: 'stdout' | 'stderr' | 'all'; limit?: number } = {}
  ): { chunks: OutputChunk[]; hasMore: boolean } {
    const metadata = this.blocks.get(blockId);
    if (!metadata) {
      return { chunks: [], hasMore: false };
    }

    const { fromSeq = 0, stream = 'all', limit = 100 } = options;

    // Get all chunks for this block
    let chunks = metadata.chunkSeqs
      .map((seq) => {
        // Find chunk by block ID and seq
        for (const [, chunk] of this.chunks) {
          if (chunk.blockId === blockId && chunk.seq === seq) {
            return chunk;
          }
        }
        return undefined;
      })
      .filter((c): c is OutputChunk => c !== undefined);

    // Filter by seq
    chunks = chunks.filter((c) => c.seq > fromSeq);

    // Filter by stream
    if (stream !== 'all') {
      chunks = chunks.filter((c) => c.stream === stream);
    }

    // Sort by seq
    chunks.sort((a, b) => a.seq - b.seq);

    // Apply limit
    const hasMore = chunks.length > limit;
    chunks = chunks.slice(0, limit);

    return { chunks, hasMore };
  }

  /**
   * Get a single chunk by seq
   */
  getChunkBySeq(blockId: string, seq: number): OutputChunk | undefined {
    for (const [, chunk] of this.chunks) {
      if (chunk.blockId === blockId && chunk.seq === seq) {
        return chunk;
      }
    }
    return undefined;
  }

  /**
   * Get the current global sequence number
   */
  getCurrentSeq(): number {
    return this.globalSeq;
  }

  /**
   * Pin a block (prevent automatic deletion)
   */
  pinBlock(blockId: string): boolean {
    const metadata = this.blocks.get(blockId);
    if (!metadata) return false;

    // Check pinned limit
    const pinnedCount = this.countPinnedBlocks();
    if (pinnedCount >= this.retentionPolicy.maxPinnedBlocks) {
      // Remove oldest pinned block
      this.removeOldestPinnedBlock();
    }

    metadata.block.pinned = true;
    return true;
  }

  /**
   * Unpin a block
   */
  unpinBlock(blockId: string): boolean {
    const metadata = this.blocks.get(blockId);
    if (!metadata) return false;

    metadata.block.pinned = false;
    return true;
  }

  /**
   * Delete a block and its chunks
   */
  deleteBlock(blockId: string): boolean {
    const metadata = this.blocks.get(blockId);
    if (!metadata) return false;

    // Delete chunks
    for (const seq of metadata.chunkSeqs) {
      const chunk = this.getChunkBySeq(blockId, seq);
      if (chunk) {
        this.chunks.delete(chunk.id);
      }
    }

    // Remove from blocks
    this.blocks.delete(blockId);

    // Remove from session index
    for (const [sessionName, blockIds] of this.blocksBySession) {
      const index = blockIds.indexOf(blockId);
      if (index !== -1) {
        blockIds.splice(index, 1);
        if (blockIds.length === 0) {
          this.blocksBySession.delete(sessionName);
        }
        break;
      }
    }

    return true;
  }

  /**
   * Compress old blocks (remove full output, keep preview)
   */
  compressBlock(blockId: string): boolean {
    const metadata = this.blocks.get(blockId);
    if (!metadata || metadata.compressedAt) return false;

    // Delete chunks
    for (const seq of metadata.chunkSeqs) {
      const chunk = this.getChunkBySeq(blockId, seq);
      if (chunk) {
        this.chunks.delete(chunk.id);
      }
    }

    metadata.chunkSeqs = [];
    metadata.compressedAt = new Date().toISOString();

    return true;
  }

  /**
   * Apply retention policy for a session
   */
  private applyRetention(sessionName: string): void {
    const blockIds = this.blocksBySession.get(sessionName) ?? [];
    if (blockIds.length === 0) return;

    // Get all block metadata
    const blocksWithMeta = blockIds
      .map((id) => ({ id, metadata: this.blocks.get(id) }))
      .filter((b): b is { id: string; metadata: BlockMetadata } => b.metadata !== undefined);

    // Separate pinned, failed, and regular blocks
    const pinned = blocksWithMeta.filter((b) => b.metadata.block.pinned);
    const failed = blocksWithMeta.filter(
      (b) =>
        !b.metadata.block.pinned &&
        (b.metadata.block.status === 'error' ||
          b.metadata.block.status === 'timeout' ||
          b.metadata.block.status === 'canceled')
    );
    const regular = blocksWithMeta.filter(
      (b) =>
        !b.metadata.block.pinned &&
        b.metadata.block.status !== 'error' &&
        b.metadata.block.status !== 'timeout' &&
        b.metadata.block.status !== 'canceled'
    );

    // Sort by startedAt
    const sortByTime = (a: { metadata: BlockMetadata }, b: { metadata: BlockMetadata }) =>
      new Date(a.metadata.block.startedAt).getTime() -
      new Date(b.metadata.block.startedAt).getTime();

    pinned.sort(sortByTime);
    failed.sort(sortByTime);
    regular.sort(sortByTime);

    // Apply limits to regular blocks
    while (regular.length > this.retentionPolicy.maxRecentBlocks) {
      const oldest = regular.shift();
      if (oldest) {
        this.deleteBlock(oldest.id);
      }
    }

    // Apply limits to failed blocks
    const failedRetentionDate = new Date();
    failedRetentionDate.setDate(
      failedRetentionDate.getDate() - this.retentionPolicy.failedRetentionDays
    );

    const failedToRemove: string[] = [];
    for (const f of failed) {
      const blockDate = new Date(f.metadata.block.startedAt);
      if (blockDate < failedRetentionDate) {
        failedToRemove.push(f.id);
      }
    }

    // Remove expired failed blocks
    for (const id of failedToRemove) {
      const index = failed.findIndex((f) => f.id === id);
      if (index !== -1) {
        failed.splice(index, 1);
        this.deleteBlock(id);
      }
    }

    // Apply limit to remaining failed blocks
    while (failed.length > this.retentionPolicy.maxFailedBlocks) {
      const oldest = failed.shift();
      if (oldest) {
        this.deleteBlock(oldest.id);
      }
    }

    // Compress old blocks (beyond fullOutputRecentCount)
    if (this.retentionPolicy.olderBlocksPreviewOnly) {
      const allSorted = [...blocksWithMeta].sort(
        (a, b) =>
          new Date(b.metadata.block.startedAt).getTime() -
          new Date(a.metadata.block.startedAt).getTime()
      );

      for (let i = this.retentionPolicy.fullOutputRecentCount; i < allSorted.length; i++) {
        const item = allSorted[i];
        if (item && !item.metadata.compressedAt && !item.metadata.block.pinned) {
          this.compressBlock(item.id);
        }
      }
    }
  }

  /**
   * Count pinned blocks across all sessions
   */
  private countPinnedBlocks(): number {
    let count = 0;
    for (const [, metadata] of this.blocks) {
      if (metadata.block.pinned) {
        count++;
      }
    }
    return count;
  }

  /**
   * Remove oldest pinned block
   */
  private removeOldestPinnedBlock(): void {
    let oldest: { id: string; time: number } | null = null;

    for (const [id, metadata] of this.blocks) {
      if (metadata.block.pinned) {
        const time = new Date(metadata.block.startedAt).getTime();
        if (!oldest || time < oldest.time) {
          oldest = { id, time };
        }
      }
    }

    if (oldest) {
      const metadata = this.blocks.get(oldest.id);
      if (metadata) {
        metadata.block.pinned = false;
      }
    }
  }

  /**
   * Get statistics about the store
   */
  getStats(): {
    totalBlocks: number;
    totalChunks: number;
    pinnedBlocks: number;
    failedBlocks: number;
    compressedBlocks: number;
    sessionCount: number;
  } {
    let pinnedBlocks = 0;
    let failedBlocks = 0;
    let compressedBlocks = 0;

    for (const [, metadata] of this.blocks) {
      if (metadata.block.pinned) pinnedBlocks++;
      if (
        metadata.block.status === 'error' ||
        metadata.block.status === 'timeout' ||
        metadata.block.status === 'canceled'
      ) {
        failedBlocks++;
      }
      if (metadata.compressedAt) compressedBlocks++;
    }

    return {
      totalBlocks: this.blocks.size,
      totalChunks: this.chunks.size,
      pinnedBlocks,
      failedBlocks,
      compressedBlocks,
      sessionCount: this.blocksBySession.size
    };
  }

  /**
   * Clear all blocks for a session
   */
  clearSession(sessionName: string): void {
    const blockIds = this.blocksBySession.get(sessionName) ?? [];
    for (const id of [...blockIds]) {
      this.deleteBlock(id);
    }
  }

  /**
   * Clear all blocks
   */
  clear(): void {
    this.blocks.clear();
    this.chunks.clear();
    this.blocksBySession.clear();
    this.globalSeq = 0;
  }
}

/**
 * Create a BlockStore with default settings
 */
export function createBlockStore(
  retentionPolicy?: RetentionPolicy,
  redactor?: OutputRedactor
): BlockStore {
  return new BlockStore(retentionPolicy, redactor);
}
