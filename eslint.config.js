// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Flat ESLint configuration shared across the monorepo.
 * Kept intentionally strict to enforce a consistent, professional codebase.
 */
export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/build/**', '**/node_modules/**', '**/*.tsbuildinfo'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': [
        'warn',
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      'no-console': 'warn',
    },
  },
  {
    // Config and script files may use console and are not part of the TS program.
    files: ['**/*.config.{js,ts}', '**/scripts/**'],
    ...tseslint.configs.disableTypeChecked,
    rules: { 'no-console': 'off' },
  },
);
