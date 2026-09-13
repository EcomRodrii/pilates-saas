import { test } from 'node:test';
import assert from 'node:assert/strict';

import { repartirVencidas, puedeProgramarBaja } from './baja-al-vencer.ts';

test('una cuota con baja programada se cancela y NO se renueva', () => {
  const r = repartirVencidas([{ id: 'sus-1', baja_al_vencer: true }]);
  assert.deepEqual(r.cancelar.map(s => s.id), ['sus-1']);
  assert.equal(r.renovar.length, 0);
});

test('una cuota sin baja programada se renueva igual que siempre', () => {
  // `undefined` y `null` también: filas leídas antes de la migración.
  const r = repartirVencidas([
    { id: 'a', baja_al_vencer: false },
    { id: 'b' },
    { id: 'c', baja_al_vencer: null },
  ]);
  assert.deepEqual(r.renovar.map(s => s.id), ['a', 'b', 'c']);
  assert.equal(r.cancelar.length, 0);
});

test('ninguna suscripción cae en las dos listas', () => {
  const vencidas = [{ id: 'a', baja_al_vencer: true }, { id: 'b', baja_al_vencer: false }];
  const r = repartirVencidas(vencidas);
  assert.equal(r.renovar.length + r.cancelar.length, vencidas.length);
  assert.ok(!r.renovar.some(x => r.cancelar.includes(x)));
});

test('solo se programa en una cuota activa con fecha de fin', () => {
  const cuota = { tipo: 'MENSUAL' };
  assert.equal(puedeProgramarBaja({ estado: 'ACTIVA', fechaFin: '2026-09-30' }, cuota), true);
  assert.equal(puedeProgramarBaja({ estado: 'ACTIVA', fechaFin: '2026-09-30' }, { tipo: 'BONO' }), false);
  assert.equal(puedeProgramarBaja({ estado: 'PAUSADA', fechaFin: '2026-09-30' }, cuota), false);
  assert.equal(puedeProgramarBaja({ estado: 'ACTIVA', fechaFin: null }, cuota), false);
  assert.equal(puedeProgramarBaja({ estado: 'ACTIVA', fechaFin: '2026-09-30' }, null), false);
});

test('una cuota ya vencida no admite baja a fin de periodo: puede tener el recibo de renovación generado', () => {
  const cuota = { tipo: 'MENSUAL' };
  assert.equal(puedeProgramarBaja({ estado: 'ACTIVA', fechaFin: '2026-09-12' }, cuota, '2026-09-13'), false);
  // El mismo día del vencimiento todavía se puede: el cron corre para las vencidas ANTES de hoy.
  assert.equal(puedeProgramarBaja({ estado: 'ACTIVA', fechaFin: '2026-09-13' }, cuota, '2026-09-13'), true);
  assert.equal(puedeProgramarBaja({ estado: 'ACTIVA', fechaFin: '2026-10-13' }, cuota, '2026-09-13'), true);
});
