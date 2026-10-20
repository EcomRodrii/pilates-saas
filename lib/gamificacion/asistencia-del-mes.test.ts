import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluarMesCompleto, ultimoMesCerrado, esDiaDeBarridoMensual, MIN_CLASES_LOGRO_MENSUAL,
  type HechoClaseMes,
} from './asistencia-del-mes.ts';

// «Hoy» = 1 de noviembre de 2026, 01:00 en Madrid (el barrido de las 23:00 UTC).
const HOY = new Date('2026-10-31T23:00:00Z');
const MES = ultimoMesCerrado(HOY); // octubre 2026

const clase = (inicio: string, estado: string, extra: Partial<HechoClaseMes> = {}): HechoClaseMes => ({
  inicio, estado, sesionCancelada: false, canceladaTardia: null, sesionConLista: true, ...extra,
});
const asistida = (dia: number) => clase(`2026-10-${String(dia).padStart(2, '0')}T09:00:00Z`, 'ASISTIDA');

test('el mes cerrado es el natural anterior en hora del estudio', () => {
  assert.equal(MES.clave, '2026-10');
  // Octubre acaba con el cambio a horario de invierno: 31-oct 00:00 Madrid = 30-oct 22:00Z; 1-nov = 31-oct 23:00Z.
  assert.equal(MES.desde, '2026-09-30T22:00:00.000Z');
  assert.equal(MES.hasta, '2026-10-31T23:00:00.000Z');
});

test('cruce de año: el 1-ene evalúa diciembre', () => {
  const m = ultimoMesCerrado(new Date('2027-01-01T10:00:00Z'));
  assert.equal(m.clave, '2026-12');
  assert.equal(m.hasta, '2026-12-31T23:00:00.000Z');
});

test('solo los días 1 y 2 del mes en hora del estudio son de barrido', () => {
  assert.equal(esDiaDeBarridoMensual(new Date('2026-10-31T23:00:00Z')), true); // 1-nov 00:00 Madrid
  assert.equal(esDiaDeBarridoMensual(new Date('2026-11-01T23:00:00Z')), true); // 2-nov
  assert.equal(esDiaDeBarridoMensual(new Date('2026-11-02T23:00:00Z')), false); // 3-nov
  assert.equal(esDiaDeBarridoMensual(new Date('2026-10-30T23:00:00Z')), false); // 31-oct 00:00 Madrid (UTC ya dice 30)
});

test('N es 2', () => assert.equal(MIN_CLASES_LOGRO_MENSUAL, 2));

test('mes con 1 clase: no se concede', () => {
  const r = evaluarMesCompleto([asistida(5)], MES, HOY);
  assert.deepEqual([r.cumple, r.motivo, r.validas], [false, 'pocas_clases', 1]);
});

test('mes con 2 clases y ninguna falta: se concede', () => {
  const r = evaluarMesCompleto([asistida(5), asistida(12)], MES, HOY);
  assert.deepEqual([r.cumple, r.motivo, r.validas, r.faltas], [true, 'cumple', 2, 0]);
});

test('una falta (no-show con lista pasada) lo impide aunque haya muchas clases', () => {
  const r = evaluarMesCompleto([asistida(1), asistida(2), asistida(3), clase('2026-10-09T09:00:00Z', 'NO_ASISTIO')], MES, HOY);
  assert.deepEqual([r.cumple, r.motivo, r.faltas], [false, 'con_faltas', 1]);
});

test('no-show en una clase sin lista no es falta', () => {
  const r = evaluarMesCompleto(
    [asistida(1), asistida(2), clase('2026-10-09T09:00:00Z', 'NO_ASISTIO', { sesionConLista: false })], MES, HOY);
  assert.equal(r.cumple, true);
  assert.equal(r.faltas, 0);
});

test('cancelación tardía es falta; a tiempo no', () => {
  const tardia = clase('2026-10-09T09:00:00Z', 'CANCELADA', { canceladaTardia: true });
  const aTiempo = clase('2026-10-09T09:00:00Z', 'CANCELADA', { canceladaTardia: false });
  assert.equal(evaluarMesCompleto([asistida(1), asistida(2), tardia], MES, HOY).motivo, 'con_faltas');
  assert.equal(evaluarMesCompleto([asistida(1), asistida(2), aTiempo], MES, HOY).cumple, true);
});

test('clase cancelada por el estudio: ni falta ni asistencia, con cualquier estado de reserva', () => {
  const canceladas = [
    clase('2026-10-09T09:00:00Z', 'NO_ASISTIO', { sesionCancelada: true }),
    clase('2026-10-10T09:00:00Z', 'CANCELADA', { sesionCancelada: true, canceladaTardia: true }),
    clase('2026-10-11T09:00:00Z', 'ASISTIDA', { sesionCancelada: true }),
  ];
  assert.equal(evaluarMesCompleto([asistida(1), asistida(2), ...canceladas], MES, HOY).cumple, true);
  // y la asistida de una clase cancelada no sirve para llegar al mínimo
  assert.equal(evaluarMesCompleto([asistida(1), canceladas[2]], MES, HOY).motivo, 'pocas_clases');
});

test('lista de espera y pendiente de aprobar no cuentan para nada', () => {
  const r = evaluarMesCompleto(
    [asistida(1), asistida(2), clase('2026-10-09T09:00:00Z', 'LISTA_ESPERA'), clase('2026-10-10T09:00:00Z', 'PENDIENTE_APROBACION')], MES, HOY);
  assert.equal(r.cumple, true);
});

test('una confirmada de clase terminada (por confirmar) aplaza la evaluación', () => {
  const r = evaluarMesCompleto([asistida(1), asistida(2), clase('2026-10-30T09:00:00Z', 'CONFIRMADA')], MES, HOY);
  assert.deepEqual([r.cumple, r.motivo], [false, 'por_confirmar']);
});

test('mes en curso: nunca se concede', () => {
  const mitad = new Date('2026-10-15T10:00:00Z');
  const r = evaluarMesCompleto([asistida(1), asistida(2), asistida(3)], MES, mitad);
  assert.deepEqual([r.cumple, r.motivo], [false, 'mes_en_curso']);
});

test('fin de mes y cambio de hora: se mide por hora de Madrid, no por UTC', () => {
  // 31-oct 23:30 Madrid (CET, 22:30Z) SÍ es de octubre; 1-nov 00:30 Madrid (23:30Z del 31) NO.
  const ultimaDeOctubre = clase('2026-10-31T22:30:00Z', 'NO_ASISTIO');
  const primeraDeNoviembre = clase('2026-10-31T23:30:00Z', 'NO_ASISTIO');
  assert.equal(evaluarMesCompleto([asistida(1), asistida(2), ultimaDeOctubre], MES, HOY).motivo, 'con_faltas');
  assert.equal(evaluarMesCompleto([asistida(1), asistida(2), primeraDeNoviembre], MES, HOY).cumple, true);
  // la del 30-sep 23:30 Madrid (21:30Z) es de septiembre
  const deSeptiembre = clase('2026-09-30T21:30:00Z', 'NO_ASISTIO');
  assert.equal(evaluarMesCompleto([asistida(1), asistida(2), deSeptiembre], MES, HOY).cumple, true);
});

test('idempotente: repetir el barrido da el mismo veredicto', () => {
  const clases = [asistida(5), asistida(12), clase('2026-10-20T09:00:00Z', 'CANCELADA', { canceladaTardia: false })];
  const a = evaluarMesCompleto(clases, MES, HOY);
  const b = evaluarMesCompleto(clases, MES, new Date(HOY.getTime() + 86_400_000));
  assert.deepEqual(a, b);
});

test('el mínimo es parametrizable', () => {
  assert.equal(evaluarMesCompleto([asistida(5)], MES, HOY, 1).cumple, true);
  assert.equal(evaluarMesCompleto([asistida(5), asistida(6), asistida(7)], MES, HOY, 4).cumple, false);
});
