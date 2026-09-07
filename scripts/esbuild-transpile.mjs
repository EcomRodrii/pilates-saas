#!/usr/bin/env node

// Fast transpilation without type checking — for when you need speed over safety
// Usage: node scripts/esbuild-transpile.mjs
// This watches and transpiles TypeScript to JavaScript WITHOUT type checking
// Errors are syntax-only, not type errors

import * as esbuild from 'esbuild';
import { globSync } from 'glob';

const entry = globSync([
  'app/**/*.{ts,tsx}',
  'components/**/*.{ts,tsx}',
  'lib/**/*.{ts,tsx}',
  'emails/**/*.{ts,tsx}',
  'scripts/**/*.{ts,tsx,mts}',
]);

console.log(`⚡ esbuild transpile-only mode (${entry.length} files)`);
console.log('   Syntax errors: YES | Type errors: NO | Speed: MAXIMUM');
console.log('');

// TypeScript loader WITHOUT type checking
const options = {
  entryPoints: entry,
  outdir: '.next/transpiled',
  format: 'esm',
  loader: {
    '.ts': 'ts',
    '.tsx': 'tsx',
  },
  logLevel: 'info',
};

if (process.argv.includes('--watch')) {
  console.log('🔍 Watching for changes...\n');
  esbuild
    .context(options)
    .then((ctx) => ctx.watch())
    .catch(() => process.exit(1));
} else {
  esbuild.build(options).catch(() => process.exit(1));
}
