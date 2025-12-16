/**
 * ESLint Configuration - Backend (Node.js)
 *
 * Strict rules for backend packages: core, mcp-server, web-server.
 * Inherits baseRules from eslint.config.base.js + adds type-checked rules.
 *
 * web-dashboard uses a separate config with Angular-specific rules.
 */

import {
  baseRules,
  eslintRecommended,
  tseslint,
  importPlugin,
} from './eslint.config.base.js';

export default tseslint.config(
  eslintRecommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    plugins: {
      import: importPlugin,
    },
    rules: {
      // ═══════════════════════════════════════════════════════════════
      // BASE RULES - shared across all projects
      // ═══════════════════════════════════════════════════════════════
      ...baseRules,

      // ═══════════════════════════════════════════════════════════════
      // STRICT TYPE SAFETY - require type-checking (backend only)
      // ═══════════════════════════════════════════════════════════════
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',

      // ═══════════════════════════════════════════════════════════════
      // STRICT SAFETY PATTERNS - require type-checking
      // ═══════════════════════════════════════════════════════════════
      // Forbid non-null assertions (!) - they are unsafe
      '@typescript-eslint/no-non-null-assertion': 'error',
      // Disable conflicting rule - allow "as Type" for non-null assertions
      '@typescript-eslint/non-nullable-type-assertion-style': 'off',
      // Prefer nullish coalescing (??) over logical OR (||)
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      // Require switch exhaustiveness
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      // No floating promises
      '@typescript-eslint/no-floating-promises': 'error',
      // Require await for async functions
      '@typescript-eslint/require-await': 'error',
      // Prefer dot notation over bracket notation
      '@typescript-eslint/dot-notation': 'error',

      // ═══════════════════════════════════════════════════════════════
      // STRICT CODE QUALITY - require type-checking
      // ═══════════════════════════════════════════════════════════════
      // No magic numbers (except common ones)
      '@typescript-eslint/no-magic-numbers': [
        'error',
        {
          ignore: [-1, 0, 1, 2, 100],
          ignoreArrayIndexes: true,
          ignoreDefaultValues: true,
          ignoreEnums: true,
          ignoreNumericLiteralTypes: true,
          ignoreReadonlyClassProperties: true,
        },
      ],
      // Prefer readonly
      '@typescript-eslint/prefer-readonly': 'error',
      // No unnecessary conditions
      '@typescript-eslint/no-unnecessary-condition': 'error',
      // Strict boolean expressions
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        {
          allowString: false,
          allowNumber: false,
          allowNullableObject: true,
          allowNullableBoolean: false,
          allowNullableString: false,
          allowNullableNumber: false,
        },
      ],
    },
  },
  {
    // Relax some rules for tests
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-magic-numbers': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  {
    // Relax some rules for web-server E2E tests
    files: ['packages/web-server/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-magic-numbers': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  {
    // Ignore build artifacts and web-dashboard (has its own config)
    ignores: [
      'dist/',
      'node_modules/',
      'packages/*/dist/',
      'packages/*/jest.config.js',
      'packages/web-dashboard/**',
      '*.js',
      '!eslint.config.js',
      '!eslint.config.base.js',
    ],
  }
);
