/**
 * Auto Run Manager
 *
 * Manages auto-run mode state persistence.
 */

import { z } from 'zod';
import { type StorageManager, createStorageManager } from './StorageManager.js';
import { STORAGE_KEYS } from './types.js';

// Schema for auto-run state
const autoRunSchema = z.boolean();

export class AutoRunManager {
  private active = false;
  private autoBtn: HTMLElement | null = null;
  private storage: StorageManager<boolean>;

  constructor() {
    this.storage = createStorageManager({
      key: STORAGE_KEYS.AUTO_RUN,
      schema: autoRunSchema,
      defaultValue: false,
      migrate: (raw) => {
        // Migrate from '1'/'0' string format
        if (raw === '1' || raw === 1) {
          return true;
        }
        if (raw === '0' || raw === 0) {
          return false;
        }
        return null;
      }
    });
  }

  /**
   * Bind auto-run button element
   */
  bindElement(autoBtn: HTMLElement): void {
    this.autoBtn = autoBtn;
    this.restore();
  }

  /**
   * Check if auto-run is active
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Toggle auto-run mode
   */
  toggle(): boolean {
    this.active = !this.active;
    this.autoBtn?.classList.toggle('active', this.active);
    this.storage.save(this.active);
    return this.active;
  }

  /**
   * Restore auto-run state from storage
   */
  private restore(): void {
    this.active = this.storage.load();
    if (this.active) {
      this.autoBtn?.classList.add('active');
    }
  }
}
