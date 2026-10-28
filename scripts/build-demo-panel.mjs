#!/usr/bin/env node
// Compila lib/demo/panel/entrada.ts a public/demo-panel.js: el panel REAL con un estudio de
// ejemplo, atendido en memoria por el navegador (ver lib/demo/panel/page-shim.ts). Aparte de
// `next build`, como el widget: es un único fichero sin React.
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
await esbuild.build({
  bundle: true, minify: true, sourcemap: false, format: 'iife', target: 'es2020', platform: 'browser',
  entryPoints: [path.join(raiz, 'lib/demo/panel/entrada.ts')],
  outfile: path.join(raiz, 'public/demo-panel.js'),
  alias: { '@': raiz },
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://example.supabase.co'),
  },
  logLevel: 'info',
});
console.log('✔ public/demo-panel.js generado');
