/**
 * Block Model - Server-side block state management
 *
 * Manages Warp-style command blocks for native terminal sessions.
 * Each block represents a command execution with its output.
 */

import type { Block, BlockSession } from './types.js';

const MAX_BLOCKS = 100;

/**
 * Generate a unique block ID
 */
function generateBlockId(): string {
  return `block_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * BlockModel manages the block state for a terminal session
 */
export class BlockModel {
  private blocks: Block[] = [];
  private activeBlockId: string | null = null;
  private currentCwd = '';

  constructor(initialCwd = '') {
    this.currentCwd = initialCwd;
  }

  /**
   * Start a new command block
   */
  startBlock(command: string, startLine: number): Block {
    // If there's an active block, close it first (shouldn't happen normally)
    if (this.activeBlockId) {
      this.endBlock(this.activeBlockId, 0, startLine - 1);
    }

    const block: Block = {
      id: generateBlockId(),
      command,
      output: '',
      startedAt: new Date().toISOString(),
      cwd: this.currentCwd,
      status: 'running',
      startLine
    };

    this.blocks.push(block);
    this.activeBlockId = block.id;

    // Limit the number of blocks to prevent memory issues
    if (this.blocks.length > MAX_BLOCKS) {
      this.blocks.shift();
    }

    return block;
  }

  /**
   * End a command block with exit code
   */
  endBlock(blockId: string, exitCode: number, endLine: number): Block | null {
    const block = this.blocks.find((b) => b.id === blockId);
    if (!block) {
      return null;
    }

    block.exitCode = exitCode;
    block.endedAt = new Date().toISOString();
    block.endLine = endLine;
    block.status = exitCode === 0 ? 'success' : 'error';

    if (this.activeBlockId === blockId) {
      this.activeBlockId = null;
    }

    return block;
  }

  /**
   * Append output to a block
   */
  appendOutput(blockId: string, data: string): void {
    const block = this.blocks.find((b) => b.id === blockId);
    if (block) {
      block.output += data;
    }
  }

  /**
   * Update the current working directory
   */
  setCwd(cwd: string): void {
    this.currentCwd = cwd;
  }

  /**
   * Get a block by ID
   */
  getBlock(blockId: string): Block | undefined {
    return this.blocks.find((b) => b.id === blockId);
  }

  /**
   * Get the active block
   */
  getActiveBlock(): Block | null {
    if (!this.activeBlockId) {
      return null;
    }
    return this.blocks.find((b) => b.id === this.activeBlockId) ?? null;
  }

  /**
   * Get the active block ID
   */
  getActiveBlockId(): string | null {
    return this.activeBlockId;
  }

  /**
   * Get all blocks
   */
  getAllBlocks(): Block[] {
    return [...this.blocks];
  }

  /**
   * Get recent blocks (for reconnection)
   */
  getRecentBlocks(count = 10): Block[] {
    return this.blocks.slice(-count);
  }

  /**
   * Get session state
   */
  getSession(): BlockSession {
    return {
      blocks: [...this.blocks],
      activeBlockId: this.activeBlockId
    };
  }

  /**
   * Clear all blocks
   */
  clear(): void {
    this.blocks = [];
    this.activeBlockId = null;
  }

  /**
   * Get block count
   */
  get blockCount(): number {
    return this.blocks.length;
  }
}
