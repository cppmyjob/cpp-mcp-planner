/**
 * ESLint Configuration - Angular (web-dashboard)
 *
 * Inherits baseRules from root eslint.config.base.js.
 * Adds Angular-specific rules and partial strictness.
 *
 * Does NOT include strict backend rules:
 * - no-unsafe-* (Angular heavily uses any in decorators)
 * - strict-boolean-expressions (Angular templates)
 * - no-magic-numbers (CSS/template values)
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

import angularEslint from '@angular-eslint/eslint-plugin';
import angularTemplate from '@angular-eslint/eslint-plugin-template';
import templateParser from '@angular-eslint/template-parser';
import tsParser from '@typescript-eslint/parser';
import tsEslint from '@typescript-eslint/eslint-plugin';

// Import base rules from root config
// Use pathToFileURL for proper Windows support
const currentDir = dirname(fileURLToPath(import.meta.url));
const baseConfigPath = resolve(currentDir, '../../eslint.config.base.js');
const { baseRules, importPlugin } = await import(pathToFileURL(baseConfigPath).href);

export default [
  // ═══════════════════════════════════════════════════════════════
  // IGNORES
  // ═══════════════════════════════════════════════════════════════
  {
    ignores: ['dist/**', 'node_modules/**', '.angular/**'],
  },

  // ═══════════════════════════════════════════════════════════════
  // TYPESCRIPT FILES
  // ═══════════════════════════════════════════════════════════════
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: currentDir,
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@angular-eslint': angularEslint,
      '@typescript-eslint': tsEslint,
      import: importPlugin,
    },
    rules: {
      // ─────────────────────────────────────────────────────────────
      // BASE RULES - identical to root config
      // ─────────────────────────────────────────────────────────────
      ...baseRules,

      // ─────────────────────────────────────────────────────────────
      // PARTIAL STRICTNESS - type-aware rules for Angular
      // ─────────────────────────────────────────────────────────────
      // Prefer nullish coalescing (??) over logical OR (||)
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      // Require switch exhaustiveness
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      // ─────────────────────────────────────────────────────────────
      // ANGULAR COMPONENT RULES
      // ─────────────────────────────────────────────────────────────
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/no-empty-lifecycle-method': 'error',
      '@angular-eslint/prefer-standalone': 'error',
      '@angular-eslint/use-lifecycle-interface': 'error',
      '@angular-eslint/no-input-rename': 'error',
      '@angular-eslint/no-output-rename': 'error',

      // ─────────────────────────────────────────────────────────────
      // OVERRIDES - relaxations for Angular specifics
      // ─────────────────────────────────────────────────────────────
      // Angular uses decorators with void returns
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
          allowConciseArrowFunctionExpressionsStartingWithVoid: true,
        },
      ],
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // TEST FILES - relaxed rules
  // ═══════════════════════════════════════════════════════════════
  {
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-member-accessibility': 'off',
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // HTML TEMPLATES
  // ═══════════════════════════════════════════════════════════════
  {
    files: ['**/*.html'],
    languageOptions: {
      parser: templateParser,
    },
    plugins: {
      '@angular-eslint/template': angularTemplate,
    },
    rules: {
      // Template best practices
      '@angular-eslint/template/banana-in-box': 'error',
      '@angular-eslint/template/eqeqeq': 'error',
      '@angular-eslint/template/no-negated-async': 'error',
      '@angular-eslint/template/prefer-self-closing-tags': 'error',
    },
  },
];
