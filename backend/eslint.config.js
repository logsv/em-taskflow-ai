import js from '@eslint/js';
import globals from 'globals';

/**
 * Lint rules focused on correctness and "no silent failure":
 * - no-empty / swallowed .catch handlers: use core/safe.js (swallow, background, recordHandledError)
 * - no-undef: catches missing imports (e.g. a module using axios without importing it)
 */
const SWALLOWED_CATCH = {
  selector: "CallExpression[callee.property.name='catch'] > ArrowFunctionExpression[body.type='BlockStatement'][body.body.length=0]",
  message: 'Do not swallow errors: use swallow(context, fallback) from core/safe.js.',
};
const SWALLOWED_CATCH_VALUE = {
  selector: "CallExpression[callee.property.name='catch'] > ArrowFunctionExpression[params.length=0][body.type!='BlockStatement']",
  message: 'Do not swallow errors: use swallow(context, fallback) from core/safe.js.',
};

export default [
  { ignores: ['node_modules/**', 'coverage/**', '.nyc_output/**', 'dist/**', 'src/scripts/**', 'test-*.js'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-restricted-syntax': ['error', SWALLOWED_CATCH, SWALLOWED_CATCH_VALUE],
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
      'no-useless-escape': 'warn',
      'no-prototype-builtins': 'off',
    },
  },
  {
    files: ['test/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.jasmine, createMockSandbox: 'readonly' } },
    rules: { 'no-restricted-syntax': 'off', 'no-empty': 'off' },
  },
  {
    files: ['src/temporal/workflows.js'],
    rules: { 'no-restricted-syntax': 'off' },
  },
];
