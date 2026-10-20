import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Ningún módulo alcanzable desde un componente de cliente importa `node:crypto`.
//
// Pasó con `lib/regalo/reglas.ts`: la huella del código usaba `createHash` y las pantallas de
// cliente importaban el módulo por una constante. Turbopack metió el polyfill `crypto-browserify`
// (≈ 121 KB gz) en /productos y en las pantallas de regalo de la alumna, sin que se viera nada.
// Lo de crypto va en un módulo con `import 'server-only'` (o se usa `crypto.subtle`/
// `globalThis.crypto`, que no pesa nada).
//
// Método: desde cada fichero con 'use client' se siguen los imports relativos, `@/` y los
// `import()` dinámicos; los `import type` no cuentan (se borran al compilar) y un fichero con
// `server-only` es una frontera (si un cliente lo alcanzara, el build ya fallaría).
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..');
const EXT = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap(nombre => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return nombre === 'node_modules' || nombre.startsWith('.') ? [] : ficheros(ruta);
    return /\.(ts|tsx)$/.test(nombre) && !/\.test\.tsx?$/.test(nombre) && !/\.d\.ts$/.test(nombre) ? [ruta] : [];
  });
}

const CRYPTO = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"](?:node:)?crypto(?:-browserify)?['"]/;
const SIN_COMENTARIOS = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function resolver(desde: string, espec: string): string | null {
  const base = espec.startsWith('@/') ? join(RAIZ, espec.slice(2)) : espec.startsWith('.') ? join(dirname(desde), espec) : null;
  if (!base) return null;
  if (/\.(ts|tsx)$/.test(base) && existsSync(base)) return base;
  const sinExt = base.replace(/\.(ts|tsx)$/, '');
  for (const e of EXT) if (existsSync(sinExt + e) && statSync(sinExt + e).isFile()) return sinExt + e;
  return null;
}

function importsDe(ruta: string, src: string): string[] {
  const limpio = SIN_COMENTARIOS(src);
  const salida: string[] = [];
  // `import type …` e `export type … from` se borran al compilar: no arrastran nada.
  const re = /(?:^|[\n;])\s*(import|export)\s+(type\s+)?(?:[\w*${},\s]*?\s+from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(limpio))) {
    if (m[2]) continue;
    const r = resolver(ruta, m[3] ?? m[4]);
    if (r) salida.push(r);
  }
  return salida;
}

test('desde un componente de cliente no se alcanza node:crypto ni crypto-browserify', () => {
  const todos = ['app', 'lib', 'components'].flatMap(d => ficheros(join(RAIZ, d)));
  const fuente = new Map(todos.map(f => [f, readFileSync(f, 'utf8')]));
  const esCliente = (s: string) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(s);
  const esServidor = (s: string) => /import\s+['"]server-only['"]/.test(s);

  // Grafo inverso una sola vez: de cada fichero que usa crypto hacia quien lo importa.
  const importadores = new Map<string, string[]>();
  for (const [f, s] of fuente) {
    for (const dep of importsDe(f, s)) importadores.set(dep, [...(importadores.get(dep) ?? []), f]);
  }
  const manchados = new Map<string, string>(); // fichero -> siguiente salto hacia crypto
  const cola: string[] = [];
  for (const [f, s] of fuente) {
    if (!esServidor(s) && CRYPTO.test(SIN_COMENTARIOS(s))) { manchados.set(f, ''); cola.push(f); }
  }
  while (cola.length) {
    const f = cola.shift()!;
    for (const imp of importadores.get(f) ?? []) {
      if (manchados.has(imp) || esServidor(fuente.get(imp) ?? '')) continue;
      manchados.set(imp, f);
      cola.push(imp);
    }
  }
  const culpables: string[] = [];
  for (const [f, s] of fuente) {
    if (!esCliente(s) || !manchados.has(f)) continue;
    const cadena = [f];
    while (manchados.get(cadena[cadena.length - 1])) cadena.push(manchados.get(cadena[cadena.length - 1])!);
    culpables.push(cadena.map(x => relative(RAIZ, x)).join(' -> '));
  }
  assert.deepEqual([...new Set(culpables)].slice(0, 10), [],
    'Un módulo de cliente alcanza node:crypto (polyfill de ~121 KB gz). Muévelo a un módulo con `import "server-only"` o usa crypto.subtle.');
});

test('la huella del código de la tarjeta regalo vive en un módulo solo de servidor', () => {
  const huella = readFileSync(join(RAIZ, 'lib/regalo/huella.ts'), 'utf8');
  assert.match(huella, /import\s+['"]server-only['"]/);
  assert.match(huella, /node:crypto/);
  const reglas = readFileSync(join(RAIZ, 'lib/regalo/reglas.ts'), 'utf8');
  assert.doesNotMatch(SIN_COMENTARIOS(reglas), /crypto/);
});
