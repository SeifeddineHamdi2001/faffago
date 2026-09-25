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
  // Each test file runs its own PGlite (PostgreSQL in WebAssembly) and, for
  // the e2e files, a whole NestJS app. One worker per core ran out of memory
  // when turbo ran the web and shared tests beside them: PGlite then aborts
  // with "RuntimeError: unreachable" in whichever file is unlucky.
  maxWorkers: '50%',
  // Each file leaves its PGlite's WebAssembly memory behind in the worker;
  // past this a worker is replaced before its next file (phase 8, more files).
  workerIdleMemoryLimit: '1024MB',
};
