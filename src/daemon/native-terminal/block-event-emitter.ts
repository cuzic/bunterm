/**
 * BlockEventEmitter - SSE event management for block streaming
 *
 * Provides:
 * - Sequence-numbered events for reliable delivery
 * - Subscription management for SSE connections
 * - Event history for Last-Event-ID resumption
 * - Per-block event streams
 */

import type { BlockEvent, BlockEventType, ExtendedBlock, OutputChunk } from './types.js';

/** Maximum events to keep in history per block */
const MAX_EVENT_HISTORY = 1000;

/** Event listener callback */
export type BlockEventListener = (event: BlockEvent) => void;

/**
 * Subscription for a specific block's events
 */
interface BlockSubscription {
  blockId: string;
  listener: BlockEventListener;
  fromSeq?: number;
}

/**
 * BlockEventEmitter manages SSE events for blocks
 */
export class BlockEventEmitter {
  private globalSeq = 0;
  private eventHistory: Map<string, BlockEvent[]> = new Map(); // blockId -> events
  private subscriptions: Map<string, Set<BlockSubscription>> = new Map(); // blockId -> subscriptions
  private allBlockListeners: Set<BlockEventListener> = new Set(); // listeners for all blocks

  /**
   * Emit a block event
   */
  emit(type: BlockEventType, blockId: string, data: Record<string, unknown>): BlockEvent {
    const event: BlockEvent = {
      type,
      blockId,
      seq: ++this.globalSeq,
      data,
      timestamp: new Date().toISOString()
    };

    // Store in history
    this.addToHistory(blockId, event);

    // Notify block-specific subscribers
    const subs = this.subscriptions.get(blockId);
    if (subs) {
      for (const sub of subs) {
        if (!sub.fromSeq || event.seq > sub.fromSeq) {
          try {
            sub.listener(event);
          } catch (error) {
            console.error('[BlockEventEmitter] Listener error:', error);
          }
        }
      }
    }

    // Notify all-block listeners
    for (const listener of this.allBlockListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('[BlockEventEmitter] All-block listener error:', error);
      }
    }

    return event;
  }

  /**
   * Emit block queued event
   */
  emitQueued(block: ExtendedBlock): BlockEvent {
    return this.emit('block.queued', block.id, {
      command: block.command,
      mode: block.mode,
      correlationId: block.correlationId
    });
  }

  /**
   * Emit block started event
   */
  emitStarted(block: ExtendedBlock): BlockEvent {
    return this.emit('block.started', block.id, {
      command: block.command,
      mode: block.mode,
      cwd: block.effectiveCwd,
      startedAt: block.startedAt
    });
  }

  /**
   * Emit stdout chunk event
   */
  emitStdout(blockId: string, chunk: OutputChunk): BlockEvent {
    return this.emit('block.stdout', blockId, {
      seq: chunk.seq,
      content: chunk.content,
      stream: 'stdout'
    });
  }

  /**
   * Emit stderr chunk event
   */
  emitStderr(blockId: string, chunk: OutputChunk): BlockEvent {
    return this.emit('block.stderr', blockId, {
      seq: chunk.seq,
      content: chunk.content,
      stream: 'stderr'
    });
  }

  /**
   * Emit block completed event
   */
  emitCompleted(block: ExtendedBlock): BlockEvent {
    return this.emit('block.completed', block.id, {
      exitCode: block.exitCode,
      status: block.status,
      durationMs: block.durationMs,
      endedAt: block.endedAt
    });
  }

  /**
   * Emit block canceled event
   */
  emitCanceled(blockId: string, signal: string): BlockEvent {
    return this.emit('block.canceled', blockId, {
      signal
    });
  }

  /**
   * Emit block timeout event
   */
  emitTimeout(blockId: string, timeoutMs: number): BlockEvent {
    return this.emit('block.timeout', blockId, {
      timeoutMs
    });
  }

  /**
   * Subscribe to events for a specific block
   */
  subscribe(
    blockId: string,
    listener: BlockEventListener,
    options?: { fromSeq?: number; replayHistory?: boolean }
  ): () => void {
    const subscription: BlockSubscription = {
      blockId,
      listener,
      fromSeq: options?.fromSeq
    };

    // Add to subscriptions
    let subs = this.subscriptions.get(blockId);
    if (!subs) {
      subs = new Set();
      this.subscriptions.set(blockId, subs);
    }
    subs.add(subscription);

    // Replay history if requested
    if (options?.replayHistory !== false && options?.fromSeq !== undefined) {
      const history = this.eventHistory.get(blockId) ?? [];
      for (const event of history) {
        if (event.seq > options.fromSeq) {
          try {
            listener(event);
          } catch (error) {
            console.error('[BlockEventEmitter] Replay error:', error);
          }
        }
      }
    }

    // Return unsubscribe function
    return () => {
      subs?.delete(subscription);
      if (subs?.size === 0) {
        this.subscriptions.delete(blockId);
      }
    };
  }

  /**
   * Subscribe to events for all blocks
   */
  subscribeAll(listener: BlockEventListener): () => void {
    this.allBlockListeners.add(listener);
    return () => {
      this.allBlockListeners.delete(listener);
    };
  }

  /**
   * Get event history for a block
   */
  getHistory(blockId: string, options?: { fromSeq?: number; limit?: number }): BlockEvent[] {
    const history = this.eventHistory.get(blockId) ?? [];
    let filtered = history;

    if (options?.fromSeq !== undefined) {
      filtered = filtered.filter((e) => e.seq > options.fromSeq!);
    }

    if (options?.limit !== undefined) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  /**
   * Get the current global sequence number
   */
  getCurrentSeq(): number {
    return this.globalSeq;
  }

  /**
   * Get subscriber count for a block
   */
  getSubscriberCount(blockId: string): number {
    return this.subscriptions.get(blockId)?.size ?? 0;
  }

  /**
   * Get total subscriber count
   */
  getTotalSubscriberCount(): number {
    let count = this.allBlockListeners.size;
    for (const subs of this.subscriptions.values()) {
      count += subs.size;
    }
    return count;
  }

  /**
   * Clear history for a block
   */
  clearBlockHistory(blockId: string): void {
    this.eventHistory.delete(blockId);
  }

  /**
   * Clear all history
   */
  clearAllHistory(): void {
    this.eventHistory.clear();
  }

  /**
   * Add event to history
   */
  private addToHistory(blockId: string, event: BlockEvent): void {
    let history = this.eventHistory.get(blockId);
    if (!history) {
      history = [];
      this.eventHistory.set(blockId, history);
    }

    history.push(event);

    // Trim history if too large
    if (history.length > MAX_EVENT_HISTORY) {
      history.shift();
    }
  }
}

/**
 * Create a BlockEventEmitter
 */
export function createBlockEventEmitter(): BlockEventEmitter {
  return new BlockEventEmitter();
}

/**
 * Format a BlockEvent as SSE data
 */
export function formatSSEEvent(event: BlockEvent): string {
  const lines: string[] = [];
  lines.push(`id: ${event.seq}`);
  lines.push(`event: ${event.type}`);
  lines.push(`data: ${JSON.stringify({ blockId: event.blockId, ...event.data })}`);
  lines.push(''); // Empty line to end event
  return lines.join('\n') + '\n';
}

/**
 * Create an SSE stream for a block
 */
export function createBlockSSEStream(
  emitter: BlockEventEmitter,
  blockId: string,
  options?: { lastEventId?: number }
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      // Send initial comment to establish connection
      controller.enqueue(encoder.encode(': connected\n\n'));

      // Subscribe to events
      const unsubscribe = emitter.subscribe(
        blockId,
        (event) => {
          try {
            const sseData = formatSSEEvent(event);
            controller.enqueue(encoder.encode(sseData));
          } catch (error) {
            console.error('[SSE] Encoding error:', error);
          }
        },
        {
          fromSeq: options?.lastEventId,
          replayHistory: options?.lastEventId !== undefined
        }
      );

      // Store unsubscribe for cleanup
      (controller as any)._unsubscribe = unsubscribe;
    },
    cancel() {
      // Clean up subscription
      const unsubscribe = (this as any)._unsubscribe;
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    }
  });
}
