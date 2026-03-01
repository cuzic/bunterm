/**
 * Build script for terminal-client bundle
 *
 * Bundles src/daemon/native-terminal/client/terminal-client.ts into dist/terminal-client.js
 * for use with native terminal sessions.
 */

import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const entryPoint = path.join(rootDir, 'src/daemon/native-terminal/client/terminal-client.ts');
const outFile = path.join(rootDir, 'dist/terminal-client.js');

// Ensure dist directory exists
const distDir = path.dirname(outFile);
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Check if entry point exists
if (!fs.existsSync(entryPoint)) {
  console.log('[build-terminal-client] Entry point not found, skipping build:', entryPoint);
  // Create empty placeholder for development
  fs.writeFileSync(outFile, '// Terminal client placeholder\nconsole.log("[TerminalClient] Not built yet");');
  process.exit(0);
}

try {
  const result = await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    minify: true,
    format: 'iife',
    globalName: 'TerminalClientModule',
    target: ['es2020'],
    outfile: outFile,
    sourcemap: false,
    platform: 'browser',
    logLevel: 'info',
    // Externalize xterm since it's loaded separately via xterm-bundle.js
    external: ['@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-serialize'],
  });

  const stats = fs.statSync(outFile);
  console.log(`[build-terminal-client] Built ${outFile} (${(stats.size / 1024).toFixed(2)} KB)`);

  if (result.warnings.length > 0) {
    console.warn('[build-terminal-client] Warnings:', result.warnings);
  }
} catch (error) {
  console.error('[build-terminal-client] Build failed:', error);
  process.exit(1);
}
