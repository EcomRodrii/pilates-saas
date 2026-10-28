import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// La demo no puede tocar datos reales, cobrar ni enviar nada. Esto lo fija por
// CONSTRUCCIÓN, no por buena voluntad: el motor y el catálogo son un grafo de
// funciones puras, y las rutas que ejecutan una demo no tienen acceso a nada
// con efectos. Si alguien lo cambia, este test se pone rojo antes que producción.

const raiz = join(import.meta.dirname, '..', '..');
const leer = (f: string) => readFileSync(join(raiz, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
function ficheros(dir: string): string[] {
  return readdirSync(join(raiz, dir)).flatMap((n) => {
    const rel = `${dir}/${n}`;
    return statSync(join(raiz, rel)).isDirectory() ? ficheros(rel) : [rel];
  });
}

/** Lo que NUNCA puede importar el motor: base de datos, dinero, correo, red, ficheros, entorno. */
const MODULOS_PROHIBIDOS = /supabase|stripe|resend|anthropic|sentry|server-only|rate-limit|node:fs|node:child_process|node:http|node:net/i;
const PROHIBIDO = [/\bfetch\(/, /process\.env/, /\beval\(/, /new Function/, /getSupabaseAdmin/, /\.rpc\(/, /\.from\('/];
const importaProhibido = (t: string) => [...t.matchAll(/(?:from|import\()\s*'([^']+)'/g)].map((m) => m[1]).filter((m) => MODULOS_PROHIBIDOS.test(m));

const PURO = ficheros('lib/demo').filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  // Lo que SÍ habla con el mundo está aparte y es corto: sesión (firma), rutas y modelo.
  .filter((f) => !['lib/demo/api-servidor.ts', 'lib/demo/tenti-servidor.ts', 'lib/demo/cliente.ts', 'lib/demo/persistencia.ts', 'lib/demo/sesion.ts'].includes(f));

test('el motor, el catálogo, Tenti (sin su cliente) y las reglas son puros: nada de base de datos, dinero, correo, red ni entorno', () => {
  assert.ok(PURO.length >= 10, 'se están comprobando los ficheros esperados');
  for (const f of PURO) {
    const t = leer(f);
    assert.deepEqual(importaProhibido(t), [], `${f} importa un módulo con efectos`);
    for (const re of PROHIBIDO) assert.ok(!re.test(t), `${f} contiene ${re}`);
  }
});

test('los escenarios solo importan reglas puras del producto, ninguna con efectos', () => {
  const permitidos = [/^\.\.\/\.\.\/bono-logic\.ts$/, /^\.\.\/\.\.\/booking-logic\.ts$/, /^\.\.\/\.\.\/types\.ts$/, /^\.\.\/\.\.\/recuperaciones\/(derecho-semanal|otorgar-semanales-fechas)\.ts$/, /^\.\.\/modelo\.ts$/, /^\.\.\/fechas\.ts$/, /^\.\.\/centros\.ts$/, /^zod$/];
  for (const f of ficheros('lib/demo/escenarios')) {
    for (const m of leer(f).matchAll(/from '([^']+)'/g)) {
      assert.ok(permitidos.some((p) => p.test(m[1])), `${f} importa «${m[1]}», que no está en la lista de reglas puras permitidas`);
    }
  }
});

test('las reglas del producto que usa la demo tampoco tienen efectos (se comprueba lo que arrastran)', () => {
  for (const f of ['lib/bono-logic.ts', 'lib/booking-logic.ts', 'lib/recuperaciones/derecho-semanal.ts', 'lib/recuperaciones/otorgar-semanales-fechas.ts']) {
    const t = leer(f);
    assert.deepEqual(importaProhibido(t), [], `${f} importa un módulo con efectos`);
    assert.ok(!/\bfetch\(/.test(t), `${f} usa fetch`);
  }
});

test('la ruta que ejecuta una demo no tiene acceso a ninguna base de datos ni servicio', () => {
  const t = leer('app/api/public/demo/ejecutar/route.ts');
  assert.deepEqual([...t.matchAll(/from '([^']+)'/g)].map((m) => m[1]).filter((m) => /supabase|stripe|resend|anthropic|tenti-servidor/i.test(m)), []);
  for (const re of [/\.rpc\(/, /\.from\(/, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/]) assert.ok(!re.test(t), `ejecutar contiene ${re}`);
});

test('quien escribe datos (iniciar y evaluar) solo toca plataforma_lead y su historial de consentimiento, nunca las tablas de un estudio', () => {
  const permitidas = new Set(['plataforma_lead', 'plataforma_lead_consentimiento']);
  for (const f of ['app/api/public/demo/iniciar/route.ts', 'app/api/public/demo/evaluar/route.ts']) {
    const tablas = [...leer(f).matchAll(/\.from\('([^']+)'\)/g)].map((m) => m[1]);
    assert.ok(tablas.length > 0, f);
    for (const t of tablas) assert.ok(permitidas.has(t), `${f} toca «${t}»`);
    assert.ok(!/\.rpc\(/.test(leer(f)), `${f} llama a una RPC`);
    assert.ok(!/\.delete\(/.test(leer(f)), `${f} borra`);
  }
});

test('el modelo solo puede contestar con herramientas del catálogo: ninguna ejecuta nada', () => {
  const t = leer('lib/demo/tenti.ts');
  assert.match(t, /tool_choice|herramientas\(/);
  const nombres = [...t.matchAll(/name: '([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(nombres)].sort(), ['no_soportado', 'preguntar', 'proponer_demo']);
  const servidor = leer('lib/demo/tenti-servidor.ts');
  assert.match(servidor, /tool_choice: \{ type: 'any' \}/);
  assert.ok(!/bash|computer|web_search|mcp/i.test(servidor), 'ninguna herramienta del proveedor (ejecución, web, MCP)');
});

test('el modelo de la demo es el del producto y no se sustituye en silencio', () => {
  const servidor = leer('lib/demo/tenti-servidor.ts');
  assert.match(servidor, /model: MODELO_ASISTENTE/);
  assert.ok(!/MODELO_RESPALDO|claude-haiku-4/.test(servidor));
  assert.match(readFileSync(join(raiz, 'lib/asistente/modelo.ts'), 'utf8'), /MODELO_ASISTENTE = 'claude-haiku-5-5'/);
});

test('nada de lib/demo llega al navegador con una clave: las únicas lecturas de entorno están en rutas y servidor', () => {
  for (const f of ficheros('components/demo')) assert.ok(!/process\.env\.(?!NEXT_PUBLIC_)/.test(leer(f)), f);
  for (const f of ficheros('lib/demo').filter((x) => !x.endsWith('.test.ts'))) {
    const t = leer(f);
    if (/process\.env/.test(t)) assert.ok(['lib/demo/sesion.ts', 'lib/demo/api-servidor.ts'].includes(f), `${f} lee el entorno`);
  }
});
