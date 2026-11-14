import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarFechaRenovacion, atajosDeRenovacion, puedeCambiarFechaRenovacion, MAX_DIAS_RENOVACION } from './fecha-renovacion-reglas.ts';

const HOY = '2026-11-14';

test('hoy y cualquier día futuro, hasta el máximo, son válidos', () => {
  assert.deepEqual(validarFechaRenovacion('2026-11-30', HOY), { ok: true, fecha: '2026-11-30' });
  assert.equal(validarFechaRenovacion(HOY, HOY).ok, true);
  assert.equal(validarFechaRenovacion('2027-12-19', HOY).ok, true);
});

test('una fecha pasada, inexistente, mal escrita o demasiado lejana no pasa', () => {
  for (const f of ['2026-11-13', '2026-02-30', '30/11/2026', '', null, undefined, 20261130, '2028-12-31']) {
    assert.equal(validarFechaRenovacion(f, HOY).ok, false, String(f));
  }
  assert.ok(MAX_DIAS_RENOVACION >= 366);
});

test('los atajos: fin de este mes y del siguiente, también cruzando el año y en febrero bisiesto', () => {
  assert.deepEqual(atajosDeRenovacion('2026-11-14'), [
    { etiqueta: 'Fin de este mes', fecha: '2026-11-30' },
    { etiqueta: 'Fin del mes que viene', fecha: '2026-12-31' },
  ]);
  // Diciembre cruza el año; febrero de un año bisiesto tiene 29 días.
  assert.equal(atajosDeRenovacion('2026-12-05')[1].fecha, '2027-01-31');
  assert.equal(atajosDeRenovacion('2028-01-10')[1].fecha, '2028-02-29');
  // El último día del mes todavía vale (renueva al día siguiente).
  assert.equal(atajosDeRenovacion('2026-11-30')[0].fecha, '2026-11-30');
});

test('solo una cuota mensual, activa, con fecha y sin Stripe', () => {
  const ok = { estado: 'ACTIVA', fechaFin: '2026-12-09', stripeSubscriptionId: null };
  assert.deepEqual(puedeCambiarFechaRenovacion(ok, 'MENSUAL'), { ok: true });
  assert.equal(puedeCambiarFechaRenovacion(ok, 'BONO').ok, false);
  assert.equal(puedeCambiarFechaRenovacion({ ...ok, estado: 'CANCELADA' }, 'MENSUAL').ok, false);
  assert.equal(puedeCambiarFechaRenovacion({ ...ok, estado: 'PAUSADA' }, 'MENSUAL').ok, false);
  assert.equal(puedeCambiarFechaRenovacion({ ...ok, fechaFin: null }, 'MENSUAL').ok, false);
  assert.equal(puedeCambiarFechaRenovacion({ ...ok, stripeSubscriptionId: 'sub_1' }, 'MENSUAL').ok, false);
});
