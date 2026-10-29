import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as esbuild from 'esbuild';

// `public/demo-panel.js` se VERSIONA (ver scripts/build-demo-panel.mjs): este test falla si no es lo que saldría de compilar el código
// de hoy. Se arregla con `node scripts/build-demo-panel.mjs`. Y comprueba que no lleva nada de ningún entorno.
const raiz = join(import.meta.dirname, '..', '..', '..');

test('public/demo-panel.js es exactamente lo que sale de compilar lib/demo/panel/entrada.ts', async () => {
  const r = await esbuild.build({
    bundle: true, minify: true, sourcemap: false, format: 'iife', target: 'es2020', platform: 'browser', write: false,
    entryPoints: [join(raiz, 'lib/demo/panel/entrada.ts')], outfile: join(raiz, 'public/demo-panel.js'),
    alias: { '@': raiz }, define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
  });
  const esperado = r.outputFiles[0].text;
  const actual = readFileSync(join(raiz, 'public/demo-panel.js'), 'utf8');
  assert.equal(actual, esperado, 'public/demo-panel.js está desactualizado: ejecuta `node scripts/build-demo-panel.mjs` y súbelo');
});

test('el paquete no lleva ninguna URL, clave ni secreto de ningún entorno', () => {
  const t = readFileSync(join(raiz, 'public/demo-panel.js'), 'utf8');
  assert.ok(!/https?:\/\/[a-z0-9-]+\.supabase\.(co|in)/i.test(t), 'una URL de Supabase fijada');
  assert.ok(!/sk_(live|test)_|eyJhbGciOi[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(t), 'una clave o JWT');
  assert.ok(!/NEXT_PUBLIC_|process\.env/.test(t), 'una lectura del entorno');
});
