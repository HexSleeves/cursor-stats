import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { defineConfig } from 'rolldown';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  dependencies?: Record<string, string>;
};
const dependencies = Object.keys(packageJson.dependencies ?? {});
const nodeBuiltins = [
  ...builtinModules,
  ...builtinModules.map((name) => (name.startsWith('node:') ? name : `node:${name}`)),
];

export default defineConfig({
  input: 'src/extension.ts',
  external: ['vscode', ...dependencies, ...nodeBuiltins],
  platform: 'node',
  tsconfig: './tsconfig.json',
  output: {
    file: 'out/extension.js',
    format: 'cjs',
    sourcemap: true,
    codeSplitting: false,
  },
});
