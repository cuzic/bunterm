/**
 * ESLint configuration for AI development anti-pattern detection
 *
 * This config focuses on patterns that Biome cannot detect:
 * - Silent fail / silent fallback detection
 * - no-await-in-loop for sequential async calls
 * - Type-aware rules for unsafe type usage
 * - Custom rules for AI-specific anti-patterns
 *
 * Usage: Run alongside Biome for comprehensive linting
 * Command: bun run check:ai
 */

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const localRules = require('./eslint-rules/index.cjs');

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  {
    // Register custom local rules plugin
    plugins: {
      'local-rules': localRules,
      'import': importPlugin
    },
    // AI Development Anti-Pattern Rules
    rules: {
      // ============================================
      // 1. Silent Fail / Silent Fallback Detection
      // ============================================
      // Detect empty catch blocks
      'no-empty': ['error', { allowEmptyCatch: false }],
      // Detect useless catch (catch and immediately rethrow)
      'no-useless-catch': 'error',
      // Custom: Detect catch blocks without logging or rethrowing
      'local-rules/no-silent-catch': ['error', {
        logFunctions: [
          'console.error',
          'console.warn',
          'console.log',
          'logger.error',
          'logger.warn',
          'logger.info',
          'logError',
          'reportError',
          'captureException',
          'captureError'
        ],
        allowCommentedCatch: true,
        checkReturnFallback: false // Handled by no-silent-fallback
      }],
      // Custom: Detect fallback returns without logging
      'local-rules/no-silent-fallback': ['error', {
        logFunctions: [
          'console.error',
          'console.warn',
          'console.log',
          'logger.error',
          'logger.warn',
          'logger.info',
          'logError',
          'reportError',
          'captureException',
          'captureError',
          'Sentry.captureException',
          'Sentry.captureError'
        ],
        requireErrorInLog: false // Set to true for stricter checking
      }],
      // Custom: Require error cause when rethrowing
      'local-rules/require-error-cause': 'warn',

      // ============================================
      // 1.5. CLI Tool Best Practices
      // ============================================
      // Prevent process.exit() in library code
      'local-rules/no-process-exit-in-lib': ['error', {
        allowedPaths: [
          '**/index.ts',
          '**/index.js',
          '**/cli.ts',
          '**/cli.js',
          '**/commands/**',
          '**/bin/**'
        ]
      }],
      // Ensure Commander.js commands have descriptions
      'local-rules/require-command-description': ['warn', {
        checkOptions: true,
        checkArguments: true
      }],
      // Detect hardcoded credentials and secrets
      'local-rules/no-hardcoded-credentials': ['error', {
        minSecretLength: 8,
        allowTestFiles: true
      }],

      // ============================================
      // 2. Type Safety (any propagation prevention)
      // ============================================
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',

      // ============================================
      // 3. Async/Await Anti-Patterns
      // ============================================
      // Prevent sequential async calls in loops (use Promise.all instead)
      'no-await-in-loop': 'error',
      // Ensure async functions actually await something
      'require-await': 'error',
      // Avoid unnecessary return await
      'no-return-await': 'error',

      // ============================================
      // 4. Promise Handling
      // ============================================
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'warn',
      '@typescript-eslint/promise-function-async': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'warn',

      // ============================================
      // 5. AI-Specific Anti-Patterns (no-restricted-syntax)
      // ============================================
      'no-restricted-syntax': [
        'error',
        // Prevent await in for loops (use Promise.all instead)
        {
          selector: 'ForStatement AwaitExpression',
          message: 'Avoid await in for loops. Use Promise.all() for parallel execution.'
        },
        {
          selector: 'ForInStatement AwaitExpression',
          message: 'Avoid await in for-in loops. Use Promise.all() for parallel execution.'
        },
        {
          selector: 'ForOfStatement AwaitExpression',
          message: 'Avoid await in for-of loops. Use Promise.all() for parallel execution.'
        }
      ],

      // ============================================
      // 6. Security Rules
      // ============================================
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',

      // ============================================
      // 7. Code Quality
      // ============================================
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'eqeqeq': ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',

      // ============================================
      // 8. Import Rules
      // ============================================
      // Prefer path aliases (@/) over parent directory imports
      'import/no-relative-parent-imports': 'error',

      // ============================================
      // Disable rules handled by Biome
      // ============================================
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off'
    }
  },
  {
    // Relaxed rules for test files
    files: ['tests/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      'no-console': 'off',
      'require-await': 'off',
      'local-rules/no-silent-catch': 'off',
      'local-rules/no-silent-fallback': 'off',
      'local-rules/require-error-cause': 'off',
      'local-rules/no-process-exit-in-lib': 'off',
      'local-rules/require-command-description': 'off',
      'local-rules/no-hardcoded-credentials': 'off',
      // Allow parent imports in test files
      'import/no-relative-parent-imports': 'off'
    }
  },
  {
    // Relaxed rules for CLI entry points and UI
    files: ['src/index.ts', 'src/ui.ts', 'src/commands/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      // CLI may intentionally process files sequentially
      'no-await-in-loop': 'warn',
      'no-restricted-syntax': 'off'
    }
  },
  {
    // tmux.ts has expected failures (tmux not installed, no sessions)
    files: ['src/tmux.ts'],
    rules: {
      'local-rules/no-silent-catch': 'off',
      'local-rules/no-silent-fallback': 'off'
    }
  },
  {
    ignores: ['dist/**', 'node_modules/**', '*.js', '*.mjs', 'eslint-rules/**', '**/*.test.ts', '**/*.spec.ts']
  }
);
