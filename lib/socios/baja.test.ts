import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bajaSinConsecuencias, planDeBaja, type CuotaDeLaClienta, type PlanDeLaCuota, MOTIVOS_BAJA, ETIQUETA_MOTIVO_BAJA, esMotivoBaja } from './baja.ts';

const HOY = '2026-10-01';
const PLANES: PlanDeLaCuota[] = [
  { id: 'mensual', nombre: 'Mensual 2×/semana', tipo: 'MENSUAL' },
  { id: 'bono', nombre: 'Bono 10', tipo: 'BONO' },
  { id: 'prueba', nombre: 'Clase de prueba', tipo: 'BONO' },
];
const cuota = (c: Partial<CuotaDeLaClienta>): CuotaDeLaClienta => ({ id: 'c', planId: 'mensual', estado: 'ACTIVA', fechaFin: '2026-10-12', ...c });

test('una cuota mensual con renovación por llegar sigue hasta su fecha y no se renueva', () => {
  const p = planDeBaja([cuota({ id: 'm' })], PLANES, [], HOY);
  assert.deepEqual(p.alVencer, [{ id: 'm', plan: 'Mensual 2×/semana', fechaFin: '2026-10-12' }]);
  assert.deepEqual(p.cancelarAhora, []);
});

test('la que vence HOY todavía se puede dejar correr hasta su fecha', () => {
  assert.equal(planDeBaja([cuota({ fechaFin: HOY })], PLANES, [], HOY).alVencer.length, 1);
});

test('una cuota ya vencida se cancela ya: su renovación puede estar generada y se cobraría', () => {
  const p = planDeBaja([cuota({ id: 'v', fechaFin: '2026-09-30' })], PLANES, [], HOY);
  assert.deepEqual(p.cancelarAhora.map(c => c.id), ['v']);
  assert.equal(p.alVencer.length, 0);
});

test('una cuota mensual sin fecha de fin se cancela ya: no hay final de periodo al que esperar', () => {
  assert.deepEqual(planDeBaja([cuota({ id: 'sf', fechaFin: null })], PLANES, [], HOY).cancelarAhora.map(c => c.id), ['sf']);
});

test('una cuota mensual pausada se cancela', () => {
  assert.deepEqual(planDeBaja([cuota({ id: 'p', estado: 'PAUSADA' })], PLANES, [], HOY).cancelarAhora.map(c => c.id), ['p']);
});

test('bonos y pruebas no se tocan: no se renuevan solos y, si vuelve, los tiene', () => {
  const p = planDeBaja([cuota({ id: 'b', planId: 'bono' }), cuota({ id: 'pr', planId: 'prueba', estado: 'PAUSADA' })], PLANES, [], HOY);
  assert.deepEqual(p.intactas.map(c => c.id), ['b', 'pr']);
  assert.deepEqual([...p.alVencer, ...p.cancelarAhora], []);
});

test('lo cancelado o caducado no entra en la baja', () => {
  const p = planDeBaja([cuota({ estado: 'CANCELADA' }), cuota({ estado: 'EXPIRADA' })], PLANES, [], HOY);
  assert.ok(bajaSinConsecuencias(p));
  assert.deepEqual(p.intactas, []);
});

test('con dos planes a la vez (mensual + bono) cada uno va por su lado', () => {
  const p = planDeBaja([cuota({ id: 'm' }), cuota({ id: 'b', planId: 'bono' })], PLANES, [], HOY);
  assert.deepEqual(p.alVencer.map(c => c.id), ['m']);
  assert.deepEqual(p.intactas.map(c => c.id), ['b']);
});

test('un plan borrado del catálogo no se renueva solo: se deja como está', () => {
  const p = planDeBaja([cuota({ id: 'x', planId: 'ya-no-existe' })], PLANES, [], HOY);
  assert.deepEqual(p.intactas, [{ id: 'x', plan: 'su plan', fechaFin: '2026-10-12' }]);
});

test('las plazas fijas activas y pausadas pasan a baja; las que ya lo están, no', () => {
  const p = planDeBaja([], PLANES, [{ id: 'a', estado: 'ACTIVA' }, { id: 'p', estado: 'PAUSADA' }, { id: 'b', estado: 'BAJA' }], HOY);
  assert.deepEqual(p.plazas, ['a', 'p']);
  assert.equal(bajaSinConsecuencias(p), false);
});

test('el motivo de la baja: uno de la lista, nunca texto libre', () => {
  for (const m of MOTIVOS_BAJA) assert.equal(esMotivoBaja(m), true, m);
  for (const m of ['', 'se muda', 'MUDANZA', null, undefined, 3]) assert.equal(esMotivoBaja(m), false, String(m));
  assert.equal(ETIQUETA_MOTIVO_BAJA.NO_LE_CONVENCIO, 'No le convenció');
});
