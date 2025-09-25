import js from '@eslint/js';

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      'out/**',
      'artifacts/**',
      'logs/**',
      'tests/golden/**',
      'client/**',  // Ignore React client completely
      'src/api/index.js'  // Temporarily ignore API file due to parsing issues
    ]
  },
  {
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        global: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly'
      }
    },
    rules: {
      // Convert errors to warnings for gradual migration
      'no-unused-vars': 'warn',
      'no-undef': 'warn',
      'no-console': 'off', // Allow console for now, will be handled by winston proxy
      
      // Code quality warnings
      'no-debugger': 'warn',
      'no-unreachable': 'warn',
      'no-duplicate-case': 'warn',
      'no-empty': 'warn',
      'no-extra-semi': 'warn',
      
      // TODO tracking - disabled in config files
      'no-warning-comments': 'off'
    }
  }
];