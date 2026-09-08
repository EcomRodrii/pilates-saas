import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alternarSeleccion } from './seleccion-multiple.ts';

test('marca mientras quede sitio', () => {
  let sel: string[] = [];
  for (const v of ['Reformer', 'Mat', 'Prenatal', 'Suelo pélvico']) {
    const r = alternarSeleccion(sel, v, 4);
    assert.equal(r.topeAlcanzado, false);
    sel = r.seleccion;
  }
  assert.deepEqual(sel, ['Reformer', 'Mat', 'Prenatal', 'Suelo pélvico']);
});

test('desmarcar quita solo esa, y funciona con el tope lleno', () => {
  const r = alternarSeleccion(['Reformer', 'Mat', 'Prenatal', 'Suelo pélvico'], 'Mat', 4);
  assert.equal(r.topeAlcanzado, false);
  assert.deepEqual(r.seleccion, ['Reformer', 'Prenatal', 'Suelo pélvico']);
});

// Regresión del caso real: el 5.º clic borraba «Reformer» sin avisar.
test('con el tope lleno, una opción nueva NO sustituye a la primera', () => {
  const antes = ['Reformer', 'Mat', 'Prenatal', 'Suelo pélvico'];
  const r = alternarSeleccion(antes, 'Rehabilitación', 4);
  assert.equal(r.topeAlcanzado, true, 'debe avisar de que no cabe');
  assert.deepEqual(r.seleccion, antes, 'la selección no se toca');
  assert.ok(r.seleccion.includes('Reformer'), 'Reformer no puede desaparecer');
});

// Regresión del caso que costaba dinero: el estudio se montaba sin bonos.
test('marcar las tres formas de cobro con tope 2 conserva los bonos', () => {
  let sel: string[] = [];
  const rBonos = alternarSeleccion(sel, 'Bonos de sesiones', 2);
  sel = rBonos.seleccion;
  const rCuota = alternarSeleccion(sel, 'Cuota mensual', 2);
  sel = rCuota.seleccion;
  const rSuelta = alternarSeleccion(sel, 'Clase suelta', 2);

  assert.equal(rSuelta.topeAlcanzado, true);
  assert.deepEqual(rSuelta.seleccion, ['Bonos de sesiones', 'Cuota mensual']);
  assert.ok(
    rSuelta.seleccion.includes('Bonos de sesiones'),
    'los bonos son el producto principal de un estudio de Pilates: no pueden caerse solos',
  );
});

test('no muta el array recibido', () => {
  const original = ['Reformer', 'Mat'];
  const copia = [...original];
  alternarSeleccion(original, 'Cadillac', 4);
  alternarSeleccion(original, 'Reformer', 4);
  alternarSeleccion(original, 'Cadillac', 2);
  assert.deepEqual(original, copia);
});

test('tope de 1 se comporta como selección única explícita', () => {
  const r = alternarSeleccion(['Mat'], 'Reformer', 1);
  assert.equal(r.topeAlcanzado, true);
  assert.deepEqual(r.seleccion, ['Mat'], 'hay que quitar Mat a mano antes de poner Reformer');
});
