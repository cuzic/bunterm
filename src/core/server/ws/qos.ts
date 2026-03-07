/**
 * QoS (Quality of Service) Manager
 *
 * Manages dynamic priority between terminal and AI streams.
 * Implements output throttling for high-throughput scenarios.
 */

// === Priority Types ===

export interface DynamicQoS {
  /** Get terminal stream priority (0-100) */
  getTerminalPriority(): number;
  /** Get AI stream priority (0-100) */
  getAIPriority(): number;
}

// === Adaptive QoS Implementation ===

export interface AdaptiveQoSOptions {
  /** Terminal priority when AI is not active (default: 100) */
  terminalIdlePriority?: number;
  /** Terminal priority when AI is active (default: 50) */
  terminalActivePriority?: number;
  /** AI priority when AI is not active (default: 50) */
  aiIdlePriority?: number;
  /** AI priority when AI is active (default: 100) */
  aiActivePriority?: number;
}

export class AdaptiveQoS implements DynamicQoS {
  private aiRunActive = false;
  private readonly terminalIdlePriority: number;
  private readonly terminalActivePriority: number;
  private readonly aiIdlePriority: number;
  private readonly aiActivePriority: number;

  constructor(options: AdaptiveQoSOptions = {}) {
    this.terminalIdlePriority = options.terminalIdlePriority ?? 100;
    this.terminalActivePriority = options.terminalActivePriority ?? 50;
    this.aiIdlePriority = options.aiIdlePriority ?? 50;
    this.aiActivePriority = options.aiActivePriority ?? 100;
  }

  /**
   * Mark AI run as active or inactive
   */
  setAIRunActive(active: boolean): void {
    this.aiRunActive = active;
  }

  /**
   * Check if AI run is active
   */
  isAIRunActive(): boolean {
    return this.aiRunActive;
  }

  getTerminalPriority(): number {
    return this.aiRunActive ? this.terminalActivePriority : this.terminalIdlePriority;
  }

  getAIPriority(): number {
    return this.aiRunActive ? this.aiActivePriority : this.aiIdlePriority;
  }
}

// === Output Throttler ===

export interface TerminalOutputThrottlerOptions {
  /** Maximum buffer size in chunks (default: 1000) */
  maxBufferSize?: number;
  /** Flush interval in ms (default: 16ms for ~60fps) */
  flushIntervalMs?: number;
}

export class TerminalOutputThrottler {
  private buffer: string[] = [];
  private readonly maxBufferSize: number;
  private readonly flushIntervalMs: number;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushCallback: ((data: string) => void) | null = null;

  constructor(options: TerminalOutputThrottlerOptions = {}) {
    this.maxBufferSize = options.maxBufferSize ?? 1000;
    this.flushIntervalMs = options.flushIntervalMs ?? 16;
  }

  /**
   * Start the throttler with a flush callback
   */
  start(onFlush: (data: string) => void): void {
    this.flushCallback = onFlush;
    this.flushTimer = setInterval(() => {
      this.flushNow();
    }, this.flushIntervalMs);
  }

  /**
   * Stop the throttler
   */
  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushCallback = null;
    this.buffer = [];
  }

  /**
   * Append data to the buffer
   */
  append(data: string): void {
    this.buffer.push(data);

    // Buffer overflow protection: drop old data
    while (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }
  }

  /**
   * Flush the buffer immediately
   */
  flushNow(): void {
    if (this.buffer.length === 0 || !this.flushCallback) {
      return;
    }

    const combined = this.buffer.join('');
    this.buffer = [];
    this.flushCallback(combined);
  }

  /**
   * Get current buffer size
   */
  get bufferSize(): number {
    return this.buffer.length;
  }

  /**
   * Check if buffer is empty
   */
  get isEmpty(): boolean {
    return this.buffer.length === 0;
  }
}

// === AI Stream Throttler ===

export interface AIStreamThrottlerOptions {
  /** Minimum interval between chunk sends in ms (default: 50) */
  minIntervalMs?: number;
  /** Maximum chunks to buffer before force flush (default: 10) */
  maxBufferedChunks?: number;
}

export class AIStreamThrottler {
  private buffer: string[] = [];
  private lastSentAt = 0;
  private readonly minIntervalMs: number;
  private readonly maxBufferedChunks: number;
  private sendTimer: ReturnType<typeof setTimeout> | null = null;
  private sendCallback: ((data: string) => void) | null = null;

  constructor(options: AIStreamThrottlerOptions = {}) {
    this.minIntervalMs = options.minIntervalMs ?? 50;
    this.maxBufferedChunks = options.maxBufferedChunks ?? 10;
  }

  /**
   * Start the throttler with a send callback
   */
  start(onSend: (data: string) => void): void {
    this.sendCallback = onSend;
  }

  /**
   * Stop the throttler
   */
  stop(): void {
    if (this.sendTimer) {
      clearTimeout(this.sendTimer);
      this.sendTimer = null;
    }
    this.sendCallback = null;
    this.buffer = [];
  }

  /**
   * Add a chunk to be sent
   */
  addChunk(chunk: string): void {
    this.buffer.push(chunk);

    // Force flush if buffer is full
    if (this.buffer.length >= this.maxBufferedChunks) {
      this.flushNow();
      return;
    }

    // Schedule send if not already scheduled
    if (!this.sendTimer) {
      const elapsed = Date.now() - this.lastSentAt;
      const delay = Math.max(0, this.minIntervalMs - elapsed);

      this.sendTimer = setTimeout(() => {
        this.sendTimer = null;
        this.flushNow();
      }, delay);
    }
  }

  /**
   * Flush the buffer immediately
   */
  flushNow(): void {
    if (this.buffer.length === 0 || !this.sendCallback) {
      return;
    }

    if (this.sendTimer) {
      clearTimeout(this.sendTimer);
      this.sendTimer = null;
    }

    const combined = this.buffer.join('');
    this.buffer = [];
    this.lastSentAt = Date.now();
    this.sendCallback(combined);
  }

  /**
   * Get current buffer size
   */
  get bufferSize(): number {
    return this.buffer.length;
  }
}

// === Singleton Management ===

let adaptiveQoSInstance: AdaptiveQoS | null = null;

/**
 * Get or create the adaptive QoS instance
 */
export function getAdaptiveQoS(): AdaptiveQoS {
  if (!adaptiveQoSInstance) {
    adaptiveQoSInstance = new AdaptiveQoS();
  }
  return adaptiveQoSInstance;
}

/**
 * Reset the adaptive QoS instance (for testing)
 */
export function resetAdaptiveQoS(): void {
  adaptiveQoSInstance = null;
}
