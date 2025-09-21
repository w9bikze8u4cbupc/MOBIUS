// ESLint configuration for ESLint v9+
import pluginJs from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import pluginPrettier from 'eslint-plugin-prettier';
import promise from 'eslint-plugin-promise';
import security from 'eslint-plugin-security';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';

export default [
  // Global ignores
  {
    ignores: ['node_modules/', 'dist/', 'build/', 'logs/', '*.log', '**/*.min.js'],
  },

  // Base configuration
  {
    files: ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
        ...globals.jest,
      },
    },
    plugins: {
      prettier: pluginPrettier,
      import: importPlugin,
      promise: promise,
      security: security,
      sonarjs: sonarjs,
    },
    rules: {
      ...pluginJs.configs.recommended.rules,
      ...eslintConfigPrettier.rules,
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-empty': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      indent: ['error', 2],
      'linebreak-style': 'off',
      quotes: ['error', 'single'],
      semi: ['error', 'always'],
      'max-lines': ['warn', 500],
      'max-lines-per-function': ['warn', 80],
      complexity: ['warn', 12],
      'import/order': ['warn', { 'newlines-between': 'always', alphabetize: { order: 'asc' } }],
      'promise/no-return-wrap': 'error',
      'security/detect-object-injection': 'error',
      'security/detect-non-literal-fs-filename': 'error',
      'security/detect-unsafe-regex': 'error',
      'sonarjs/cognitive-complexity': ['warn', 15],
    },
  },

  // Test files configuration
  {
    files: ['**/*.test.*', '**/*.spec.*'],
    rules: {
      'no-console': 'off',
    },
  },
];
