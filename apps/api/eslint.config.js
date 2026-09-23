import base from '@faffago/config/eslint/base.js';

export default [
  ...base,
  {
    // Nest injects constructor parameters from the emitted type metadata, so an
    // import used only as a constructor type is a runtime value. Telling the
    // parser keeps consistent-type-imports from turning it into `import type`,
    // which would compile cleanly and break injection at startup.
    languageOptions: {
      parserOptions: {
        emitDecoratorMetadata: true,
        experimentalDecorators: true,
      },
    },
  },
  {
    // NestJS decorators need parameter properties and metadata emit.
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
];
