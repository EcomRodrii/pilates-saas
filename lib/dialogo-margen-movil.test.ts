// ─────────────────────────────────────────────────────────────────────────────
// Un diálogo nunca toca los bordes de la pantalla del móvil.
//
// El margen vivía DENTRO del tope (`max-w-[min(calc(100%-2rem),24rem)]`) y
// `cn` sustituye ese `max-w-*` por el de quien usa el diálogo: un
// `className="max-w-md"` a secas —el caso de medio panel— dejaba el diálogo a
// 100 % del ancho, pegado a los dos bordes a 390 px. Ahora el margen va en el
// ANCHO de la base y cada diálogo solo elige su tope; lo único que lo rompe es
// pisar el ancho, y eso es lo que se vigila aquí.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const raiz = join(import.meta.dirname, '..');

function tsx(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(join(raiz, dir))) {
    const rel = `${dir}/${e}`;
    if (statSync(join(raiz, rel)).isDirectory()) tsx(rel, acc);
    else if (e.endsWith('.tsx')) acc.push(rel);
  }
  return acc;
}

// El `className="…"` de cada `<DialogContent …>`. Un `className={…}` calculado
// no se lee (no lo hay hoy); si llega, que se mire a mano.
const CLASE_DEL_DIALOGO = /<DialogContent\b[^>]*?\bclassName="([^"]*)"/g;
// Cualquier utilidad de ancho SIN prefijo (`w-full`, `w-screen`, `w-[…]`). Con
// prefijo de pantalla grande (`sm:w-…`) no cuenta: ahí el margen ya sobra.
const PISA_EL_ANCHO = /(?:^|\s)w-\S+/;

function anchosPisados(codigo: string): string[] {
  return [...codigo.matchAll(CLASE_DEL_DIALOGO)]
    .map(([, clases]) => clases)
    .filter(clases => PISA_EL_ANCHO.test(clases));
}

test('la base del diálogo lleva el margen del móvil en el ancho, no en el tope', () => {
  const src = readFileSync(join(raiz, 'components/ui/dialog.tsx'), 'utf8');
  const base = src.match(/"panel-dialogo [^"]*"/)?.[0] ?? '';
  assert.match(base, /\bw-\[calc\(100%-2rem\)\]/,
    'Sin el margen en el ancho, el `max-w-*` de cada diálogo vuelve a pegarlo a los bordes del móvil.');
  assert.doesNotMatch(base, /max-w-\[[^\]]*calc/,
    'Un margen dentro del tope se pierde en cuanto un diálogo pone su `max-w-*`.');
});

test('ningún diálogo pisa el ancho de la base', () => {
  const culpables = ['app', 'components'].flatMap(d => tsx(d))
    .flatMap(f => anchosPisados(readFileSync(join(raiz, f), 'utf8')).map(c => `${f}: "${c}"`));
  assert.deepEqual(culpables, [],
    'Un `w-*` en <DialogContent> quita el margen del móvil: elige solo el tope (`max-w-md`, `sm:max-w-lg`…).');
});

test('la guardia ve un ancho pisado y deja pasar el tope y el prefijo de pantalla grande', () => {
  assert.deepEqual(anchosPisados('<DialogContent className="max-w-lg w-full">'), ['max-w-lg w-full']);
  assert.deepEqual(anchosPisados('<DialogContent\n  data-x="1"\n  className="w-[95vw] p-0">'), ['w-[95vw] p-0']);
  assert.deepEqual(anchosPisados('<DialogContent className="max-w-md">'), []);
  assert.deepEqual(anchosPisados('<DialogContent className="sm:w-auto sm:max-w-5xl max-w-[26rem]">'), []);
});
