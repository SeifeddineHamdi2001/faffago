/**
 * Runs the API's TypeScript as is, for the browser tests' server only.
 *
 * NestJS resolves a constructor's dependencies from the decorator metadata
 * TypeScript emits, which tsx (esbuild) does not write. This hook compiles
 * each file with TypeScript itself, one file at a time, as ts-jest does for
 * the API tests. Files keep their place, so `__dirname` still finds the
 * migrations, the seed data and the label fonts.
 */
const { readFileSync } = require('node:fs');
const ts = require('typescript');

const compilerOptions = {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022,
  esModuleInterop: true,
  experimentalDecorators: true,
  emitDecoratorMetadata: true,
  inlineSourceMap: true,
};

require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions,
    fileName: filename,
  });
  module._compile(outputText, filename);
};
