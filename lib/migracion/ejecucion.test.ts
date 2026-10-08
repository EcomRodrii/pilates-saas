import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEPENDE_DE, bloqueadaPor, estadoDeEntidad, actaIncompleta } from './ejecucion.ts';
import { ORDEN_EJECUCION, type EntidadMigracion } from './clasificador.ts';

test('toda entidad del orden de ejecución tiene sus dependencias declaradas y ninguna es circular', () => {
  for (const e of ORDEN_EJECUCION) {
    assert.ok(e in DEPENDE_DE, e);
    for (const d of DEPENDE_DE[e]) assert.ok(ORDEN_EJECUCION.indexOf(d) < ORDEN_EJECUCION.indexOf(e), `${e} depende de ${d}, que va después`);
  }
});

test('si falla el horario, los bonos y membresías SÍ se intentan; las reservas no', () => {
  const fallidas = new Set<EntidadMigracion>(['clases']);
  assert.deepEqual(bloqueadaPor('membresias', fallidas), []);
  assert.deepEqual(bloqueadaPor('reservas', fallidas), ['clases']);
  assert.deepEqual(bloqueadaPor('pagos', fallidas), []);
});

test('si fallan las socias, todo lo que cuelga de ellas queda bloqueado', () => {
  const fallidas = new Set<EntidadMigracion>(['socias']);
  for (const e of ['membresias', 'reservas', 'citas', 'pagos', 'recuperaciones'] as EntidadMigracion[]) {
    assert.ok(bloqueadaPor(e, fallidas).includes('socias'), e);
  }
  assert.deepEqual(bloqueadaPor('clases', fallidas), []);
});

test('estado por entidad: sin error importada; con error y algo dentro parcial; con error y nada fallida', () => {
  assert.equal(estadoDeEntidad({ importadas: 300 }), 'importada');
  assert.equal(estadoDeEntidad({ importadas: 120, error: 'x' }), 'parcial');
  assert.equal(estadoDeEntidad({ importadas: 0, error: 'x' }), 'fallida');
});

test('un acta con una entidad no importada NO está completa aunque ninguna lleve error', () => {
  assert.equal(actaIncompleta([{ estado: 'importada' }, { estado: 'no_importada' }]), true);
  assert.equal(actaIncompleta([{ estado: 'importada' }]), false);
  assert.equal(actaIncompleta([{ error: 'x' }]), true);
});
