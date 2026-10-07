import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caraDeLaMarca, esLogoApaisado } from './marca-cabecera.ts';

const LOGO = 'https://x.supabase.co/storage/v1/object/public/avatars/logo-studio-1?v=1';

test('caraDeLaMarca: sin logo, la inicial', () => {
  assert.equal(caraDeLaMarca({ logoUrl: null, medido: null, fallo: null }), 'inicial');
});

test('caraDeLaMarca: con logo que aún no ha llegado, la inicial y el logo cargando — nunca un cuadrado blanco vacío', () => {
  assert.equal(caraDeLaMarca({ logoUrl: LOGO, medido: null, fallo: null }), 'cargando');
});

test('caraDeLaMarca: el logo, solo cuando ESE logo ha cargado', () => {
  assert.equal(caraDeLaMarca({ logoUrl: LOGO, medido: { src: LOGO, apaisado: false }, fallo: null }), 'logo');
  // Lo medido era de otra URL (el estudio cambió de logo): se vuelve a esperar.
  assert.equal(caraDeLaMarca({ logoUrl: LOGO, medido: { src: `${LOGO}0`, apaisado: false }, fallo: null }), 'cargando');
});

test('caraDeLaMarca: un logo apaisado o que no carga se queda en la inicial', () => {
  assert.equal(caraDeLaMarca({ logoUrl: LOGO, medido: { src: LOGO, apaisado: true }, fallo: null }), 'inicial');
  assert.equal(caraDeLaMarca({ logoUrl: LOGO, medido: null, fallo: LOGO }), 'inicial');
  // El fallo de OTRO logo no tapa el actual.
  assert.equal(caraDeLaMarca({ logoUrl: LOGO, medido: null, fallo: 'otro' }), 'cargando');
});

test('esLogoApaisado: el lockup con el nombre al lado sí; un logo cuadrado o sin medir, no', () => {
  assert.equal(esLogoApaisado(1254, 1254), false);
  assert.equal(esLogoApaisado(400, 100), true);
  assert.equal(esLogoApaisado(320, 100), false);
  assert.equal(esLogoApaisado(72, 0), false);
});
