/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testRegex: '.*\.(spec|e2e-spec)\.ts$',
  moduleNameMapper: {
    '^@faffago/shared$': '<rootDir>/../../packages/shared/src/index.ts',
  },
  // Testcontainers needs room to pull and boot PostgreSQL on a cold machine.
  testTimeout: 120000,
};
