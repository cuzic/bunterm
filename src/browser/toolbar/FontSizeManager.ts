/**
 * Font Size Manager
 *
 * Handles font size persistence to localStorage.
 */

import { z } from 'zod';
import { type StorageManager, createStorageManager } from './StorageManager.js';
import type { TerminalUiConfig } from './types.js';
import { STORAGE_KEYS } from './types.js';
import { isMobileDevice } from './utils.js';

export class FontSizeManager {
  private config: TerminalUiConfig;
  private storage: StorageManager<number>;
  private defaultSize: number;

  constructor(config: TerminalUiConfig) {
    this.config = config;
    this.defaultSize = isMobileDevice()
      ? config.font_size_default_mobile
      : config.font_size_default_pc;

    // Schema with min/max validation
    const fontSizeSchema = z.number().int().min(config.font_size_min).max(config.font_size_max);

    this.storage = createStorageManager({
      key: STORAGE_KEYS.FONT_SIZE,
      schema: fontSizeSchema,
      defaultValue: this.defaultSize,
      migrate: (raw) => {
        // Migrate from string format
        if (typeof raw === 'string') {
          const size = Number.parseInt(raw, 10);
          if (!Number.isNaN(size) && size >= config.font_size_min && size <= config.font_size_max) {
            return size;
          }
        }
        return null;
      }
    });
  }

  /**
   * Save font size to storage
   */
  save(size: number): void {
    this.storage.save(size);
  }

  /**
   * Load font size from storage
   */
  load(): number {
    return this.storage.load();
  }
}
