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
import rxjsX from 'eslint-plugin-rxjs-x';

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
      'rxjs-x': rxjsX,
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
      // ANGULAR COMPONENT/DIRECTIVE - additional best practices
      // ─────────────────────────────────────────────────────────────
      '@angular-eslint/component-class-suffix': 'error',
      '@angular-eslint/directive-class-suffix': 'error',
      '@angular-eslint/contextual-decorator': 'error',
      '@angular-eslint/contextual-lifecycle': 'error',
      '@angular-eslint/no-attribute-decorator': 'error',
      '@angular-eslint/no-conflicting-lifecycle': 'error',
      '@angular-eslint/prefer-host-metadata-property': 'error',
      '@angular-eslint/no-input-prefix': 'error',
      '@angular-eslint/no-inputs-metadata-property': 'error',
      '@angular-eslint/no-lifecycle-call': 'error',
      '@angular-eslint/no-output-native': 'error',
      '@angular-eslint/no-output-on-prefix': 'error',
      '@angular-eslint/no-outputs-metadata-property': 'error',
      '@angular-eslint/no-pipe-impure': 'error',
      '@angular-eslint/no-queries-metadata-property': 'error',
      '@angular-eslint/pipe-prefix': ['error', { prefixes: ['app'] }],
      '@angular-eslint/prefer-output-readonly': 'error',
      '@angular-eslint/relative-url-prefix': 'error',
      '@angular-eslint/use-component-selector': 'error',
      '@angular-eslint/use-pipe-transform-interface': 'error',

      // ─────────────────────────────────────────────────────────────
      // RXJS BEST PRACTICES - using rxjs-x plugin (ESLint 9 compatible)
      // ─────────────────────────────────────────────────────────────
      'rxjs-x/finnish': ['error', { methods: false }],
      'rxjs-x/no-async-subscribe': 'error',
      'rxjs-x/no-compat': 'error',
      'rxjs-x/no-connectable': 'error',
      'rxjs-x/no-create': 'error',
      'rxjs-x/no-cyclic-action': 'error',
      'rxjs-x/no-ignored-notifier': 'error',
      'rxjs-x/no-unsafe-takeuntil': 'error',
      'rxjs-x/no-floating-observables': 'error',
      'rxjs-x/no-ignored-replay-buffer': 'error',
      'rxjs-x/no-internal': 'error',
      'rxjs-x/no-nested-subscribe': 'error',
      'rxjs-x/no-redundant-notify': 'error',
      'rxjs-x/no-sharereplay': 'error',
      'rxjs-x/no-unsafe-subject-next': 'error',
      'rxjs-x/no-topromise': 'error',
      'rxjs-x/no-unbound-methods': 'error',
      'rxjs-x/throw-error': 'error',

      // ─────────────────────────────────────────────────────────────
      // TYPESCRIPT ORGANIZATION
      // ─────────────────────────────────────────────────────────────
      '@typescript-eslint/adjacent-overload-signatures': 'error',
      '@typescript-eslint/member-ordering': [
        'error',
        {
          default: { memberTypes: 'never' },
          classes: [
            'public-static-field',
            'protected-static-field',
            'private-static-field',
            'public-decorated-field',
            'protected-decorated-field',
            'private-decorated-field',
            'public-instance-field',
            'protected-instance-field',
            'private-instance-field',
            'public-abstract-field',
            'protected-abstract-field',
            'public-field',
            'instance-field',
            'protected-field',
            'private-field',
            'abstract-field',
            'public-get',
            'protected-get',
            'private-get',
            'constructor',
            'public-static-method',
            'protected-static-method',
            'private-static-method',
            'public-method',
            'protected-method',
            'private-method',
          ],
        },
      ],
      '@typescript-eslint/unified-signatures': 'error',

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

      // Template accessibility
      '@angular-eslint/template/alt-text': 'error',
      '@angular-eslint/template/button-has-type': 'error',
      '@angular-eslint/template/conditional-complexity': ['error', { maxComplexity: 5 }],
      '@angular-eslint/template/no-any': 'error',
      '@angular-eslint/template/no-autofocus': 'error',
      '@angular-eslint/template/no-distracting-elements': 'error',
      '@angular-eslint/template/no-positive-tabindex': 'error',
      '@angular-eslint/template/interactive-supports-focus': 'error',
      '@angular-eslint/template/role-has-required-aria': 'error',
      '@angular-eslint/template/table-scope': 'error',
      '@angular-eslint/template/valid-aria': 'error',
    },
  },
];
