/**
 * Build script for AI Chat React app
 *
 * Bundles the React app using esbuild.
 */

import * as esbuild from 'esbuild';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const srcDir = join(projectRoot, 'src');

const entryPoint = join(
  projectRoot,
  'src/browser/terminal/app/index.tsx'
);
const outfile = join(projectRoot, 'dist/ai-chat.js');

// Ensure dist directory exists
const distDir = join(projectRoot, 'dist');
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// Build configuration
const buildOptions = {
  entryPoints: [entryPoint],
  bundle: true,
  outfile,
  format: 'iife',
  globalName: 'AIChat',
  platform: 'browser',
  target: ['es2020'],
  minify: process.argv.includes('--minify'),
  sourcemap: process.argv.includes('--sourcemap'),
  jsx: 'automatic',
  define: {
    'process.env.NODE_ENV': JSON.stringify(
      process.argv.includes('--minify') ? 'production' : 'development'
    )
  },
  external: [],
  loader: {
    '.tsx': 'tsx',
    '.ts': 'ts',
    '.jsx': 'jsx',
    '.js': 'js'
  },
  // Handle node_modules
  nodePaths: [join(projectRoot, 'node_modules')],
  // Resolve path aliases (@/ -> src/)
  alias: {
    '@': srcDir,
  },
  // Banner for IIFE
  banner: {
    js: '/* AI Chat React App - bunterm */'
  }
};

async function build() {
  try {
    console.log('[build-ai-chat] Building AI Chat app...');
    console.log(`  Entry: ${entryPoint}`);
    console.log(`  Output: ${outfile}`);

    const result = await esbuild.build(buildOptions);

    if (result.errors.length > 0) {
      console.error('[build-ai-chat] Build errors:', result.errors);
      process.exit(1);
    }

    if (result.warnings.length > 0) {
      console.warn('[build-ai-chat] Build warnings:', result.warnings);
    }

    console.log('[build-ai-chat] Build complete!');

    // Print bundle size
    const fs = await import('fs');
    const stats = fs.statSync(outfile);
    const sizeKB = (stats.size / 1024).toFixed(2);
    console.log(`  Bundle size: ${sizeKB} KB`);
  } catch (error) {
    console.error('[build-ai-chat] Build failed:', error);
    process.exit(1);
  }
}

// Watch mode
async function watch() {
  console.log('[build-ai-chat] Starting watch mode...');

  const ctx = await esbuild.context({
    ...buildOptions,
    sourcemap: true
  });

  await ctx.watch();
  console.log('[build-ai-chat] Watching for changes...');
}

// Run
if (process.argv.includes('--watch')) {
  watch();
} else {
  build();
}
