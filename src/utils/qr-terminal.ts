/**
 * QR code terminal renderer using Unicode half-block characters.
 *
 * Renders a QR code as text suitable for terminal output.
 * Uses ▀ (upper half block), ▄ (lower half block), █ (full block),
 * and space to pack two rows of QR modules into a single terminal line.
 *
 * The output assumes a dark terminal background (light modules = dark chars).
 */
import qrcode from 'qrcode-generator';

// Unicode block characters
const BOTH_BLACK = ' '; // both rows are "light" (background)
const TOP_BLACK = '▄'; // top light, bottom dark
const BOTTOM_BLACK = '▀'; // top dark, bottom light
const BOTH_WHITE = '█'; // both rows are "dark" (foreground)

/**
 * Generate a compact QR code string for terminal display.
 *
 * @param url - The URL to encode
 * @returns Multi-line string containing the QR code
 */
export function generateQRTerminal(url: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();

  const moduleCount = qr.getModuleCount();
  // Add 2-module quiet zone on each side
  const quiet = 2;
  const size = moduleCount + quiet * 2;

  // Helper: is module dark? (quiet zone = false)
  const isDark = (row: number, col: number): boolean => {
    const r = row - quiet;
    const c = col - quiet;
    if (r < 0 || r >= moduleCount || c < 0 || c >= moduleCount) return false;
    return qr.isDark(r, c);
  };

  const lines: string[] = [];

  // Process two rows at a time for compact rendering
  for (let row = 0; row < size; row += 2) {
    let line = '';
    for (let col = 0; col < size; col++) {
      const top = isDark(row, col);
      const bottom = row + 1 < size ? isDark(row + 1, col) : false;

      if (top && bottom) {
        line += BOTH_WHITE;
      } else if (top) {
        line += BOTTOM_BLACK;
      } else if (bottom) {
        line += TOP_BLACK;
      } else {
        line += BOTH_BLACK;
      }
    }
    lines.push(line);
  }

  return lines.join('\n');
}
