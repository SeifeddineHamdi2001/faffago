// Shared flat ESLint config for every workspace.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',

      // Money is integer millimes in bigint. Floating-point arithmetic on money
      // is the one bug this codebase must never ship (CLAUDE.md, Money).
      //
      // Only the coercions are banned: Number(x) and parseFloat(x) turn an
      // amount into a float. Number.isInteger and Number.isSafeInteger are
      // guards against exactly that, so they stay allowed.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.name="Number"]',
          message:
            'Money is integer millimes. Use parseDT or millimesFromJson from @faffago/shared.',
        },
        {
          selector: 'CallExpression[callee.name="parseFloat"]',
          message: 'Money is integer millimes. Use parseDT from @faffago/shared.',
        },
        {
          selector: 'CallExpression[callee.name="parseInt"]',
          message: 'Use BigInt(...) for money, or Number.parseInt with an explicit radix.',
        },
      ],
    },
  },
  {
    ignores: ['dist/**', '.next/**', 'node_modules/**', '**/*.config.js', '**/*.config.ts'],
  },
);
