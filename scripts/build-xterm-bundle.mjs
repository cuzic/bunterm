/**
 * Build script for xterm.js client bundle
 *
 * Bundles @xterm/xterm and addons into dist/xterm-bundle.js
 * for use with native terminal sessions.
 */

import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const entryPoint = path.join(rootDir, 'src/daemon/native-terminal/client/xterm-bundle.ts');
const outFile = path.join(rootDir, 'dist/xterm-bundle.js');
const cssOutFile = path.join(rootDir, 'dist/xterm.css');

// Ensure dist directory exists
const distDir = path.dirname(outFile);
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Check if entry point exists
if (!fs.existsSync(entryPoint)) {
  console.log('[build-xterm-bundle] Entry point not found, skipping build:', entryPoint);
  // Create empty placeholder for development
  fs.writeFileSync(outFile, '// xterm.js bundle placeholder\nconsole.log("[xterm] Bundle not built yet");');
  process.exit(0);
}

try {
  // Build the JavaScript bundle
  const result = await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    minify: true,
    format: 'iife',
    globalName: 'XtermBundle',
    target: ['es2020'],
    outfile: outFile,
    sourcemap: false,
    platform: 'browser',
    logLevel: 'info',
    // Export Terminal and addons for use by terminal-client.js
    footer: {
      js: 'window.XtermBundle = XtermBundle;'
    }
  });

  const stats = fs.statSync(outFile);
  console.log(`[build-xterm-bundle] Built ${outFile} (${(stats.size / 1024).toFixed(2)} KB)`);

  if (result.warnings.length > 0) {
    console.warn('[build-xterm-bundle] Warnings:', result.warnings);
  }

  // Copy xterm.css from node_modules
  const xtermCssSource = path.join(rootDir, 'node_modules/@xterm/xterm/css/xterm.css');
  if (fs.existsSync(xtermCssSource)) {
    fs.copyFileSync(xtermCssSource, cssOutFile);
    const cssStats = fs.statSync(cssOutFile);
    console.log(`[build-xterm-bundle] Copied ${cssOutFile} (${(cssStats.size / 1024).toFixed(2)} KB)`);
  } else {
    console.warn('[build-xterm-bundle] xterm.css not found at:', xtermCssSource);
  }

} catch (error) {
  console.error('[build-xterm-bundle] Build failed:', error);
  process.exit(1);
}
