import base from '@faffago/config/eslint/base.js';

export default [
  ...base,
  {
    // NestJS decorators need parameter properties and metadata emit.
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
];
