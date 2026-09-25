import base from '@faffago/config/eslint/base.js';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  ...base,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  { ignores: ['babel.config.js', 'metro.config.js', 'jest.config.js', 'dist/**'] },
];
