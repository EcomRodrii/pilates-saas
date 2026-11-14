import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarNuevoImporte, puedeCambiarImporte, IMPORTE_MAXIMO, COLUMNAS_QUE_BLOQUEAN } from './cambiar-importe-reglas.ts';

test('un importe válido: número o texto con coma, dos decimales como mucho', () => {
  assert.deepEqual(validarNuevoImporte(35), { ok: true, importe: 35 });
  assert.deepEqual(validarNuevoImporte('33,39'), { ok: true, importe: 33.39 });
  assert.deepEqual(validarNuevoImporte('0.5'), { ok: true, importe: 0.5 });
});

test('no pasan: vacío, texto, negativo, cero, por debajo de 0,50 €, tres decimales o un cero de más', () => {
  for (const v of ['', 'abc', null, undefined, NaN, Infinity, -5, 0, 0.49, '12,345', IMPORTE_MAXIMO + 1]) {
    assert.equal(validarNuevoImporte(v).ok, false, String(v));
  }
});

const PENDIENTE = { id: 'rec-abc', estado: 'PENDIENTE', importe: 45, intentos_reintento: 0 };

test('un recibo pendiente y limpio se puede cambiar', () => {
  assert.deepEqual(puedeCambiarImporte(PENDIENTE), { ok: true });
  // El cobro automático programado (proximo_reintento) NO bloquea: en un estudio que cobra a mano está siempre puesto y no hace nada.
  assert.deepEqual(puedeCambiarImporte({ ...PENDIENTE, proximo_reintento: '2026-12-01T08:00:00Z' } as never), { ok: true });
});

test('cualquier pago abierto, intentado, devuelto o anulado lo bloquea', () => {
  for (const c of COLUMNAS_QUE_BLOQUEAN) {
    assert.equal(puedeCambiarImporte({ ...PENDIENTE, [c]: 'x' }).ok, false, c);
  }
  assert.equal(puedeCambiarImporte({ ...PENDIENTE, intentos_reintento: 1 }).ok, false);
  assert.equal(puedeCambiarImporte({ ...PENDIENTE, factura_pendiente_sellar: true }).ok, false);
  assert.equal(puedeCambiarImporte({ ...PENDIENTE, entrega_aplicada: true }).ok, false);
});

test('solo un recibo pendiente: lo cobrado, en el banco, devuelto o fallido no', () => {
  for (const estado of ['COBRADO', 'EN_CURSO', 'DEVUELTO', 'FALLIDO', 'ANULADO', null]) {
    assert.equal(puedeCambiarImporte({ ...PENDIENTE, estado }).ok, false, String(estado));
  }
});

test('penalizaciones, ventas de la caja y clases sueltas tienen otro dueño', () => {
  for (const id of ['rec-penaliz-1', 'rec-pos-1', 'rec-suelta-1']) {
    const r = puedeCambiarImporte({ ...PENDIENTE, id });
    assert.equal(r.ok, false, id);
  }
  // La parte proporcional y la alineación sí: es lo que el estudio quiere poder ajustar.
  assert.equal(puedeCambiarImporte({ ...PENDIENTE, id: 'rec-prorrateo-1' }).ok, true);
});
