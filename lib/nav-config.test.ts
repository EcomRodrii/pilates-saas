import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODULOS, ESSENTIAL_HREFS, NO_OCULTABLES } from './nav-config.ts';

// La pantalla de traerse los datos de otra app EXISTÍA, pero no había forma de
// llegar a ella: había que saberse la URL. Una dueña que viene de BSport no
// adivina `/migracion`.
//
// El fichero era `.tsx` sin tener una sola línea de JSX, y por eso el menú
// —la primera pantalla de todo el producto— no tenía ni un test: `node --test`
// no carga `.tsx`. Renombrado a `.ts`; los imports van sin extensión y no
// cambia ninguno.

test('se puede llegar a «Traer mis datos» desde el menú', () => {
  const item = MODULOS.find(m => m.href === '/migracion');
  assert.ok(item, 'la entrada tiene que existir en el menú');
  assert.equal(item?.label, 'Traer mis datos');
});

test('sin jerga: no se llama «Migración»', () => {
  // Nadie que viene de otra app piensa en migrar: piensa en traerse lo suyo.
  const item = MODULOS.find(m => m.href === '/migracion');
  assert.doesNotMatch(item?.label ?? '', /migrac/i);
});

test('sale en el modo por defecto, que es el del estudio recién creado', () => {
  // El modo por defecto es «esencial». Dejarla fuera la escondería justo del
  // estudio que la necesita: el que aún no ha traído sus datos.
  assert.ok(ESSENTIAL_HREFS.includes('/migracion'));
});

test('quien ya migró puede quitarla del menú', () => {
  // Es la contrapartida de que salga por defecto. Sin esta salida, sería una
  // entrada de por vida para algo que se usa una vez.
  assert.equal(NO_OCULTABLES.includes('/migracion'), false);
});

test('no hay dos entradas apuntando al mismo sitio', () => {
  const hrefs = MODULOS.map(m => m.href);
  assert.equal(new Set(hrefs).size, hrefs.length, 'hay un href duplicado en el menú');
});
