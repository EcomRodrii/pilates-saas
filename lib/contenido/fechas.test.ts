import test from 'node:test';
import assert from 'node:assert/strict';

import { aInputLocal, desdeInputLocal, fechaValida } from './fechas.ts';

test('⚠️ el valor vacío del input no revienta al guardar', () => {
  // El bug real (Sentry JAVASCRIPT-NEXTJS-1B, 2026-08-13): `guardar()` hacía
  // `new Date(fecha).toISOString()` con el campo vacío y lanzaba
  // `RangeError: Invalid time value` sin capturar — botón muerto, cuatro
  // clics, cero publicaciones guardadas.
  assert.equal(desdeInputLocal(''), null);
  assert.equal(desdeInputLocal('no es una fecha'), null);
  assert.equal(desdeInputLocal('2026-13-45T99:99'), null);
});

test('⚠️ una fecha estropeada no se convierte en «NaN-NaN-NaN»', () => {
  // La otra mitad: esa cadena la RECHAZA el input y deja el campo en blanco,
  // así que la publicación se abría sin fecha y al guardar tumbaba la
  // pantalla. Vacío es un problema que se ve; «NaN-NaN-NaN» es uno que no.
  assert.equal(aInputLocal(''), '');
  assert.equal(aInputLocal(null), '');
  assert.equal(aInputLocal(undefined), '');
  assert.equal(aInputLocal('vete a saber'), '');
});

test('ida y vuelta: el instante se conserva', () => {
  // Se compara el INSTANTE, no la cadena: `aInputLocal` escribe hora de pared
  // (sin zona) y `desdeInputLocal` la vuelve a leer como local, así que el
  // texto intermedio depende de la zona de quien mira y el instante no.
  const iso = new Date(2026, 8, 4, 18, 30, 0, 0).toISOString();
  const vuelta = desdeInputLocal(aInputLocal(iso));
  assert.ok(vuelta);
  assert.equal(new Date(vuelta).getTime(), new Date(iso).getTime());
});

test('los segundos se pierden a propósito: el input solo llega al minuto', () => {
  const conSegundos = new Date(2026, 8, 4, 18, 30, 45, 0);
  const vuelta = desdeInputLocal(aInputLocal(conSegundos.toISOString()));
  assert.equal(new Date(vuelta!).getSeconds(), 0);
});

test('fechaValida distingue una fecha de un desastre', () => {
  assert.equal(fechaValida(new Date(2026, 0, 1)), true);
  assert.equal(fechaValida(new Date('')), false);
});
