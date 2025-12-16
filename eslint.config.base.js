/**
 * ESLint Base Configuration
 *
 * Shared rules for all monorepo projects.
 * These rules DO NOT require type-checking and can be used
 * in both backend (Node.js) and frontend (Angular) projects.
 *
 * Import:
 *   import { baseRules, namingConventionRules } from './eslint.config.base.js';
 */

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';

// ═══════════════════════════════════════════════════════════════════════════
// NAMING CONVENTIONS - Identical for all projects
// ═══════════════════════════════════════════════════════════════════════════
export const namingConventionRules = {
  '@typescript-eslint/naming-convention': [
    'error',
    // Interfaces: PascalCase, NO I prefix
    {
      selector: 'interface',
      format: ['PascalCase'],
      custom: {
        regex: '^I[A-Z]',
        match: false,
      },
    },
    // Type aliases: PascalCase
    {
      selector: 'typeAlias',
      format: ['PascalCase'],
    },
    // Classes: PascalCase
    {
      selector: 'class',
      format: ['PascalCase'],
    },
    // Class properties: camelCase, no leading underscore
    {
      selector: 'classProperty',
      format: ['camelCase'],
      leadingUnderscore: 'forbid',
    },
    // Class methods: camelCase
    {
      selector: 'classMethod',
      format: ['camelCase'],
    },
    // Variables: camelCase or UPPER_CASE for constants
    {
      selector: 'variable',
      format: ['camelCase', 'UPPER_CASE'],
    },
    // Functions: camelCase
    {
      selector: 'function',
      format: ['camelCase'],
    },
    // Parameters: camelCase (allow _ for unused)
    {
      selector: 'parameter',
      format: ['camelCase'],
      leadingUnderscore: 'allow',
    },
    // Enum members: PascalCase or UPPER_CASE
    {
      selector: 'enumMember',
      format: ['PascalCase', 'UPPER_CASE'],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// BASE RULES - Do not require type-checking
// ═══════════════════════════════════════════════════════════════════════════
export const baseRules = {
  // ─────────────────────────────────────────────────────────────────────────
  // TYPE SAFETY (basic level)
  // ─────────────────────────────────────────────────────────────────────────
  '@typescript-eslint/no-explicit-any': 'error',

  // ─────────────────────────────────────────────────────────────────────────
  // EXPLICIT VISIBILITY - public/private/protected required
  // ─────────────────────────────────────────────────────────────────────────
  '@typescript-eslint/explicit-member-accessibility': [
    'error',
    {
      accessibility: 'explicit',
      overrides: {
        constructors: 'no-public',
      },
    },
  ],

  // ─────────────────────────────────────────────────────────────────────────
  // NAMING CONVENTIONS
  // ─────────────────────────────────────────────────────────────────────────
  ...namingConventionRules,

  // ─────────────────────────────────────────────────────────────────────────
  // MODULE ORGANIZATION - Named exports only
  // ─────────────────────────────────────────────────────────────────────────
  'import/no-default-export': 'error',
  'import/prefer-default-export': 'off',

  // ─────────────────────────────────────────────────────────────────────────
  // SAFETY PATTERNS (do not require type-checking)
  // ─────────────────────────────────────────────────────────────────────────
  '@typescript-eslint/prefer-optional-chain': 'error',
  '@typescript-eslint/consistent-type-imports': [
    'error',
    { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
  ],

  // ─────────────────────────────────────────────────────────────────────────
  // CODE QUALITY
  // ─────────────────────────────────────────────────────────────────────────
  '@typescript-eslint/no-unused-vars': [
    'error',
    {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    },
  ],
  '@typescript-eslint/explicit-function-return-type': [
    'error',
    {
      allowExpressions: true,
      allowTypedFunctionExpressions: true,
      allowHigherOrderFunctions: true,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// RE-EXPORTS for convenient usage
// ═══════════════════════════════════════════════════════════════════════════
export const eslintRecommended = eslint.configs.recommended;
export { tseslint, importPlugin };
