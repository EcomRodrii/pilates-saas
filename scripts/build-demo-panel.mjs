#!/usr/bin/env node
// Compila lib/demo/panel/entrada.ts a public/demo-panel.js: el panel REAL con un estudio de
// ejemplo, atendido en memoria por el navegador (ver lib/demo/panel/page-shim.ts).
//
// ⚠️ El resultado SE VERSIONA (20 KB), a diferencia de public/widget.js: el artefacto de build de CI
// enumera a mano los ficheros de public/ que pasan a los shards de e2e, y uno generado y gitignorado que
// no esté en esa lista muere en 404. No lleva NADA del entorno (ni la URL de Supabase): se sirve igual en
// todos sitios. `lib/demo/panel/bundle.test.ts` falla si queda desactualizado: `node scripts/build-demo-panel.mjs`.
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
await esbuild.build({
  bundle: true, minify: true, sourcemap: false, format: 'iife', target: 'es2020', platform: 'browser',
  entryPoints: [path.join(raiz, 'lib/demo/panel/entrada.ts')],
  outfile: path.join(raiz, 'public/demo-panel.js'),
  alias: { '@': raiz },
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
});
console.log('✔ public/demo-panel.js generado');
