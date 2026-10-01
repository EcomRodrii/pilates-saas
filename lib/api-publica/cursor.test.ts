import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codificarCursor, decodificarCursor, filtroDespuesDe, leerFecha, leerLimite, leerOrden } from './cursor.ts';

test('un cursor va y vuelve', () => {
  for (const c of [{ v: '2026-10-01', id: 'rec-1' }, { v: '2026-10-01T10:00:00.123+00:00', id: 'vpos-mrt4f31r-5-sq5x7' }]) {
    assert.deepEqual(decodificarCursor(codificarCursor(c)), c);
  }
  assert.equal(decodificarCursor(null), null);
  assert.equal(decodificarCursor(''), null);
});

test('un cursor manipulado no llega nunca a la consulta', () => {
  const malos = [
    Buffer.from(JSON.stringify(['2026-10-01,id.gt.x', 'rec-1'])).toString('base64url'),
    Buffer.from(JSON.stringify(['2026-10-01', 'rec-1),or(studio_id.neq.x'])).toString('base64url'),
    Buffer.from(JSON.stringify({ v: '2026-10-01', id: 'x' })).toString('base64url'),
    'no-es-base64-json',
    'x'.repeat(500),
  ];
  for (const m of malos) assert.equal(decodificarCursor(m), 'invalido', m);
});

test('el filtro respeta el orden', () => {
  const c = { v: '2026-10-01', id: 'rec-9' };
  assert.equal(filtroDespuesDe('fecha_cobro', c, 'asc'), 'fecha_cobro.gt.2026-10-01,and(fecha_cobro.eq.2026-10-01,id.gt.rec-9)');
  assert.equal(filtroDespuesDe('fecha_cobro', c, 'desc'), 'fecha_cobro.lt.2026-10-01,and(fecha_cobro.eq.2026-10-01,id.lt.rec-9)');
});

test('parámetros: fechas reales, límite acotado, orden conocido', () => {
  assert.equal(leerFecha('2026-02-28'), '2026-02-28');
  assert.equal(leerFecha('2026-02-30'), 'invalido');
  assert.equal(leerFecha('01/10/2026'), 'invalido');
  assert.equal(leerFecha(null), null);
  assert.equal(leerLimite(null), 50);
  assert.equal(leerLimite(null, 25), 25);
  assert.equal(leerLimite('5000'), 200);
  // Como la v1 de siempre: lo raro cae en el de por defecto, no en un 400.
  assert.equal(leerLimite('0'), 50);
  assert.equal(leerLimite('abc', 25), 25);
  assert.equal(leerLimite('3.5'), 3);
  assert.equal(leerOrden(null), 'desc');
  assert.equal(leerOrden('asc'), 'asc');
  assert.equal(leerOrden('random'), 'invalido');
});
