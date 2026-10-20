import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Un `openGraph` de página SUSTITUYE entero al del layout raíz (Next mezcla los
// metadatos sin profundidad), así que el `siteName: 'Tentare'` del layout se
// perdía en 61 de las 63 páginas públicas (auditoría de la fase 1 de la web,
// 19-oct-2026). Cada `openGraph: {` de la web de Tentare lo lleva escrito.
//
// Fuera a propósito, por marca blanca: la app de la alumna (app/portal) y la
// página de reservas de cada estudio (app/reservar), que llevan la marca del
// ESTUDIO, nunca «Tentare».

const RAIZ = join(import.meta.dirname, '..', '..');
const FUERA = ['app/portal/', 'app/reservar/'];

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return ficheros(p);
    return /\.(ts|tsx)$/.test(n) && !n.includes('.test.') ? [p] : [];
  });
}

test('todo openGraph de la web de Tentare lleva siteName', () => {
  const sin: string[] = [];
  for (const f of ficheros(join(RAIZ, 'app'))) {
    const rel = relative(RAIZ, f);
    if (FUERA.some((x) => rel.startsWith(x))) continue;
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/openGraph: \{/g)) {
      if (!/^\s*siteName:/.test(s.slice(m.index! + m[0].length, m.index! + m[0].length + 40))) sin.push(rel);
    }
  }
  assert.deepEqual(sin, [], 'estos openGraph no llevan siteName (el del layout se pierde al sustituirlo)');
});

test('la marca blanca no dice «Tentare» como sitio', () => {
  for (const d of FUERA) {
    for (const f of ficheros(join(RAIZ, d))) {
      assert.doesNotMatch(readFileSync(f, 'utf8'), /siteName: 'Tentare'/, `${relative(RAIZ, f)} es marca blanca: no puede firmar como Tentare`);
    }
  }
});
