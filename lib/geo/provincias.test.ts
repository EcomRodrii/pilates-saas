import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROVINCIAS, esCanarias, provinciaDeCp } from './provincias.ts';
import { provinciaDeCodigoPostal } from '../pos/datafono.ts';

// Un mapa para el alta (el nombre) y para el datáfono (el código ISO que acepta
// Stripe). Lo que el datáfono ya fijaba con Stripe sigue igual: lo prueba
// lib/pos/datafono.test.ts contra este mismo mapa.

test('las 52 provincias, del 01 al 52, cada una con nombre y código ISO distintos', () => {
  const claves = Object.keys(PROVINCIAS);
  assert.equal(claves.length, 52);
  for (let n = 1; n <= 52; n++) assert.ok(PROVINCIAS[String(n).padStart(2, '0')], `falta el ${n}`);
  assert.equal(new Set(Object.values(PROVINCIAS).map(p => p.iso)).size, 52, 'dos provincias con el mismo código');
  assert.equal(new Set(Object.values(PROVINCIAS).map(p => p.nombre)).size, 52, 'dos provincias con el mismo nombre');
});

test('la provincia sale del código postal, y lo que no es un código postal español no tiene', () => {
  assert.deepEqual(provinciaDeCp('28003'), { nombre: 'Madrid', iso: 'M' });
  assert.equal(provinciaDeCp('08001')?.nombre, 'Barcelona');
  assert.equal(provinciaDeCp('48001')?.nombre, 'Bizkaia');
  assert.equal(provinciaDeCp('07001')?.nombre, 'Illes Balears');
  assert.equal(provinciaDeCp(' 15001 ')?.nombre, 'A Coruña', 'con espacios alrededor, también');
  for (const malo of ['', '2800', '280031', '00123', '53001', '99999', 'abcde', null, undefined]) {
    assert.equal(provinciaDeCp(malo), null, String(malo));
  }
});

test('Canarias son el 35 y el 38, y solo con un código postal entero', () => {
  assert.equal(esCanarias('35001'), true);
  assert.equal(esCanarias('38200'), true);
  assert.equal(provinciaDeCp('35001')?.nombre, 'Las Palmas');
  assert.equal(provinciaDeCp('38200')?.nombre, 'Santa Cruz de Tenerife');
  for (const no of ['28003', '07001', '3500', '350011', '', null]) assert.equal(esCanarias(no), false, String(no));
});

test('el datáfono sigue mandando a Stripe el mismo código que antes de mover el mapa', () => {
  for (const [prefijo, p] of Object.entries(PROVINCIAS)) {
    assert.equal(provinciaDeCodigoPostal(`${prefijo}123`), p.iso, prefijo);
  }
  assert.equal(provinciaDeCodigoPostal('53001'), null);
});
