/**
 * Modifier Key State Manager
 *
 * Manages the state of Ctrl, Alt, and Shift modifier keys
 * for the toolbar buttons.
 */

export type ModifierKey = 'ctrl' | 'alt' | 'shift';

export class ModifierKeyState {
  private ctrlActive = false;
  private altActive = false;
  private shiftActive = false;

  private ctrlBtn: HTMLElement | null = null;
  private altBtn: HTMLElement | null = null;
  private shiftBtn: HTMLElement | null = null;

  /**
   * Bind DOM elements for visual feedback
   */
  bindElements(ctrlBtn: HTMLElement, altBtn: HTMLElement, shiftBtn: HTMLElement): void {
    this.ctrlBtn = ctrlBtn;
    this.altBtn = altBtn;
    this.shiftBtn = shiftBtn;
  }

  /**
   * Check if Ctrl is active
   */
  isCtrlActive(): boolean {
    return this.ctrlActive;
  }

  /**
   * Check if Alt is active
   */
  isAltActive(): boolean {
    return this.altActive;
  }

  /**
   * Check if Shift is active
   */
  isShiftActive(): boolean {
    return this.shiftActive;
  }

  /**
   * Toggle a modifier key state
   * Ctrl and Alt are mutually exclusive
   */
  toggle(key: ModifierKey): boolean {
    switch (key) {
      case 'ctrl': {
        this.ctrlActive = !this.ctrlActive;
        this.ctrlBtn?.classList.toggle('active', this.ctrlActive);
        if (this.ctrlActive) {
          this.altActive = false;
          this.altBtn?.classList.remove('active');
        }
        return this.ctrlActive;
      }

      case 'alt': {
        this.altActive = !this.altActive;
        this.altBtn?.classList.toggle('active', this.altActive);
        if (this.altActive) {
          this.ctrlActive = false;
          this.ctrlBtn?.classList.remove('active');
        }
        return this.altActive;
      }

      case 'shift': {
        this.shiftActive = !this.shiftActive;
        this.shiftBtn?.classList.toggle('active', this.shiftActive);
        return this.shiftActive;
      }
    }
  }

  /**
   * Reset Ctrl and Alt modifiers (not Shift)
   */
  resetCtrlAlt(): void {
    this.ctrlActive = false;
    this.altActive = false;
    this.ctrlBtn?.classList.remove('active');
    this.altBtn?.classList.remove('active');
  }

  /**
   * Reset all modifiers
   */
  reset(): void {
    this.ctrlActive = false;
    this.altActive = false;
    this.shiftActive = false;
    this.ctrlBtn?.classList.remove('active');
    this.altBtn?.classList.remove('active');
    this.shiftBtn?.classList.remove('active');
  }
}
