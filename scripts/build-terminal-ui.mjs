/**
 * Build script for terminal-ui client bundle
 *
 * Bundles src/browser/toolbar/index.ts into dist/terminal-ui.js
 * using esbuild with IIFE format for browser execution.
 */

import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const srcDir = path.join(rootDir, 'src');

const entryPoint = path.join(rootDir, 'src/browser/toolbar/index.ts');
const outFile = path.join(rootDir, 'dist/terminal-ui.js');

// Ensure dist directory exists
const distDir = path.dirname(outFile);
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Check if entry point exists
if (!fs.existsSync(entryPoint)) {
  console.log('[build-terminal-ui] Entry point not found, skipping build:', entryPoint);
  // Create empty placeholder for development
  fs.writeFileSync(outFile, '// Terminal UI bundle placeholder\nconsole.log("[Terminal UI] Bundle not built yet");');
  process.exit(0);
}

try {
  const result = await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['es2020'],
    outfile: outFile,
    sourcemap: false,
    // Don't include any Node.js built-ins
    platform: 'browser',
    // Log errors
    logLevel: 'info',
    // Resolve path aliases (@/ -> src/)
    alias: {
      '@': srcDir,
    },
  });

  const stats = fs.statSync(outFile);
  console.log(`[build-terminal-ui] Built ${outFile} (${(stats.size / 1024).toFixed(2)} KB)`);

  if (result.warnings.length > 0) {
    console.warn('[build-terminal-ui] Warnings:', result.warnings);
  }
} catch (error) {
  console.error('[build-terminal-ui] Build failed:', error);
  process.exit(1);
}
