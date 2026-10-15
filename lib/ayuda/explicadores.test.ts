import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EXPLICADORES, claveExplicadores } from './explicadores.ts';
import { MIN_CLASES_CELDA } from '../informes/euro-por-plaza.ts';

test('cada explicador: de 3 a 9 pasos, 1 a 5 líneas, un ejemplo en euros, recetas y dónde vive', () => {
  for (const [id, e] of Object.entries(EXPLICADORES)) {
    assert.ok(e.pasos.length >= 3 && e.pasos.length <= 9, `${id}: ${e.pasos.length} pasos`);
    for (const p of e.pasos) {
      assert.ok(p.titulo.trim(), `${id}: un paso sin título`);
      assert.ok(p.lineas.length >= 1 && p.lineas.length <= 5, `${id} «${p.titulo}»: ${p.lineas.length} líneas`);
    }
    assert.ok(e.pasos.some(p => p.lineas.some(l => /\d+(,\d+)? €/.test(l))), `${id}: ningún ejemplo con euros`);
    assert.ok(e.recetas.length > 0 && e.recetas.every(r => r.trim()), `${id}: sin recetas`);
    assert.ok(e.dondeVive.trim(), `${id}: sin «dónde vive»`);
    assert.ok(Number.isInteger(e.version) && e.version >= 1);
  }
});

test('nada de fórmulas: se cuenta con un caso, no con símbolos de álgebra', () => {
  for (const e of Object.values(EXPLICADORES)) {
    for (const l of e.pasos.flatMap(p => p.lineas)) assert.doesNotMatch(l, /[Σ∑=]\s*[a-z]|\bx\s*[=/]/i, l);
  }
});

test('«visto» va por persona, no por estudio', () => {
  assert.equal(claveExplicadores('u1'), 'tentare:explicadores:v1:u1');
});

/** Todos los .ts/.tsx de app/ y components/. */
function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === 'node_modules' ? [] : ficheros(p);
    return /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

test('guardia: el modal del explicador llega con dynamic(), nunca en el chunk de una pantalla', () => {
  const raiz = new URL('../..', import.meta.url).pathname;
  for (const f of [...ficheros(join(raiz, 'app')), ...ficheros(join(raiz, 'components'))]) {
    if (f.endsWith('explicador-ilustrado.tsx')) continue;
    const texto = readFileSync(f, 'utf8');
    assert.doesNotMatch(texto, /^import[^;]*from ['"][^'"]*explicador-ilustrado['"]/m, `${f} importa el modal a pelo: usa dynamic()`);
  }
});

test('el «—» del explicador dice el mismo mínimo de clases que el mapa', () => {
  const texto = EXPLICADORES.euroPorPlaza.pasos.flatMap(p => p.lineas).join(' ');
  assert.match(texto, new RegExp(`menos de ${MIN_CLASES_CELDA} clases`));
});

test('sin vocabulario de costes ni órdenes: el mapa no mide beneficio ni decide por ella', () => {
  const texto = Object.values(EXPLICADORES).flatMap(e => [...e.pasos.flatMap(p => [p.titulo, ...p.lineas]), ...e.recetas]).join(' ');
  assert.doesNotMatch(texto, /rentab|rinde|beneficio|ciérrala|cerrarías|más oscur/i);
});
