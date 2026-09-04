import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarValoracion, puedeValorarReserva } from './reglas.ts';

test('solo ASISTIDA puede valorar', () => {
  assert.deepEqual(puedeValorarReserva('ASISTIDA'), { ok: true });
  for (const e of ['CONFIRMADA', 'CANCELADA', 'NO_ASISTIO', 'LISTA_ESPERA', 'PENDIENTE_APROBACION']) {
    assert.deepEqual(puedeValorarReserva(e), { ok: false, motivo: 'no-asistida' }, e);
  }
});

test('sin reserva de esa clase → sin-reserva, no no-asistida', () => {
  assert.deepEqual(puedeValorarReserva(null), { ok: false, motivo: 'sin-reserva' });
  assert.deepEqual(puedeValorarReserva(undefined), { ok: false, motivo: 'sin-reserva' });
  assert.deepEqual(puedeValorarReserva(''), { ok: false, motivo: 'sin-reserva' });
});

test('la nota es un entero 1-5; todo lo demás se rechaza', () => {
  assert.equal(normalizarValoracion(0, null), null);
  assert.equal(normalizarValoracion(6, null), null);
  assert.equal(normalizarValoracion(3.5, null), null);
  assert.equal(normalizarValoracion('x', null), null);
  assert.deepEqual(normalizarValoracion('4', null), { puntuacion: 4, comentario: null });
  assert.deepEqual(normalizarValoracion(5, undefined), { puntuacion: 5, comentario: null });
});

test('el comentario se recorta a 500 y vacío es null', () => {
  assert.deepEqual(normalizarValoracion(4, '   '), { puntuacion: 4, comentario: null });
  assert.deepEqual(normalizarValoracion(4, '  genial  '), { puntuacion: 4, comentario: 'genial' });
  assert.equal(normalizarValoracion(4, 'a'.repeat(600))?.comentario?.length, 500);
  assert.deepEqual(normalizarValoracion(4, 42), { puntuacion: 4, comentario: null });
});
