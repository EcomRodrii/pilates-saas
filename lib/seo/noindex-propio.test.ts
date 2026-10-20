import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NOINDEX_PROPIO, PREFIJOS_NO_INDEXABLES } from './no-indexables.ts';

// Una ruta de NOINDEX_PROPIO sale del `disallow` de robots.txt porque lleva su
// propio `noindex` (ver el comentario de la lista). Si una dejara de llevarlo, se
// abriría al buscador sin querer: este test lo impide.

const RAIZ = join(import.meta.dirname, '..', '..');

test('cada ruta con noindex propio sigue en la lista de no indexables', () => {
  for (const r of NOINDEX_PROPIO) assert.ok((PREFIJOS_NO_INDEXABLES as readonly string[]).includes(r), `${r} debe seguir en PREFIJOS_NO_INDEXABLES`);
});

test('cada ruta con noindex propio declara robots index:false en su página o su layout', () => {
  for (const r of NOINDEX_PROPIO) {
    const ficheros = ['page.tsx', 'layout.tsx'].map((f) => join(RAIZ, 'app', r, f)).filter((f) => existsSync(f));
    assert.ok(ficheros.length > 0, `no se encontró app${r}`);
    const conNoindex = ficheros.some((f) => /robots:\s*\{\s*index:\s*false/.test(readFileSync(f, 'utf8')));
    assert.ok(conNoindex, `app${r} tiene que declarar robots: { index: false } (si no, robots.txt la abriría al buscador)`);
  }
});

test('robots.txt no bloquea las rutas con noindex propio', () => {
  const robots = readFileSync(join(RAIZ, 'app', 'robots.ts'), 'utf8');
  assert.match(robots, /NOINDEX_PROPIO\.includes/, 'app/robots.ts debe quitar NOINDEX_PROPIO del disallow');
});
