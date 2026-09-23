/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testRegex: '.*\.(spec|e2e-spec)\.ts$',
  moduleNameMapper: {
    '^@faffago/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    // packages/shared is ESM and imports its own files as './money.js'.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // Testcontainers needs room to pull and boot PostgreSQL on a cold machine.
  testTimeout: 120000,
};
