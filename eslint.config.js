'use strict';

const { defineConfig, globalIgnores } = require('eslint/config');

module.exports = defineConfig([
  {
    files: ['src/**/*.js', 'gui/**/*.js', 'test/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        exports: 'writable',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        URL: 'readonly'
      }
    },
    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-throw-literal': 'error',
      'no-return-await': 'error',
      'require-await': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'multi-line'],
      'no-duplicate-imports': 'error',
      'no-shadow': 'warn'
    }
  },
  {
    files: ['gui/app.js'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        EventSource: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        navigator: 'readonly',
        FormData: 'readonly'
      }
    }
  },
  {
    files: ['src/browser.js', 'src/scan-inbox.js', 'src/scrape.js'],
    languageOptions: {
      globals: {
        document: 'readonly',
        fetch: 'readonly',
        navigator: 'readonly',
        window: 'readonly',
        getComputedStyle: 'readonly'
      }
    }
  },
  globalIgnores(['dist/', 'node_modules/', 'data/', 'profile/', 'coverage/'])
]);
