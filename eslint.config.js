import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';

export default tseslint.config(
  eslint.configs.recommended,
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
      // TYPE SAFETY - NO any, NO unknown where avoidable
      // ═══════════════════════════════════════════════════════════════
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',

      // ═══════════════════════════════════════════════════════════════
      // EXPLICIT VISIBILITY - public/private/protected required
      // ═══════════════════════════════════════════════════════════════
      '@typescript-eslint/explicit-member-accessibility': [
        'error',
        {
          accessibility: 'explicit',
          overrides: {
            constructors: 'no-public', // constructor не требует public
          },
        },
      ],

      // ═══════════════════════════════════════════════════════════════
      // NAMING CONVENTIONS
      // - No I prefix for interfaces
      // - No _ prefix for private members (use private modifier)
      // - PascalCase for classes/interfaces/types
      // - camelCase for variables/functions/methods
      // ═══════════════════════════════════════════════════════════════
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
        // Parameters: camelCase
        {
          selector: 'parameter',
          format: ['camelCase'],
          leadingUnderscore: 'allow', // разрешаем _ для неиспользуемых параметров
        },
        // Enum members: PascalCase or UPPER_CASE
        {
          selector: 'enumMember',
          format: ['PascalCase', 'UPPER_CASE'],
        },
      ],

      // ═══════════════════════════════════════════════════════════════
      // MODULE ORGANIZATION - Named exports only, NO default exports
      // ═══════════════════════════════════════════════════════════════
      'import/no-default-export': 'error',
      'import/prefer-default-export': 'off',

      // ═══════════════════════════════════════════════════════════════
      // SAFETY PATTERNS
      // ═══════════════════════════════════════════════════════════════
      // Forbid non-null assertions (!) - они небезопасны
      '@typescript-eslint/no-non-null-assertion': 'error',
      // Отключаем конфликтующее правило - разрешаем "as Type" для non-null assertions
      '@typescript-eslint/non-nullable-type-assertion-style': 'off',
      // Prefer nullish coalescing (??) over logical OR (||)
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      // Prefer optional chaining (?.)
      '@typescript-eslint/prefer-optional-chain': 'error',
      // Require switch exhaustiveness
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      // No floating promises
      '@typescript-eslint/no-floating-promises': 'error',
      // Require await for async functions
      '@typescript-eslint/require-await': 'error',
      // Consistent type imports
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // Prefer dot notation over bracket notation
      '@typescript-eslint/dot-notation': 'error',

      // ═══════════════════════════════════════════════════════════════
      // CODE QUALITY
      // ═══════════════════════════════════════════════════════════════
      // No unused variables (allow underscore prefix for intentionally unused)
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      // No magic numbers (except common ones)
      '@typescript-eslint/no-magic-numbers': [
        'warn',
        {
          ignore: [-1, 0, 1, 2, 100],
          ignoreArrayIndexes: true,
          ignoreDefaultValues: true,
          ignoreEnums: true,
          ignoreNumericLiteralTypes: true,
          ignoreReadonlyClassProperties: true,
        },
      ],
      // Explicit return types on functions
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
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
    // Отключаем некоторые правила для тестов
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-magic-numbers': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '*.js', '!eslint.config.js'],
  }
);
