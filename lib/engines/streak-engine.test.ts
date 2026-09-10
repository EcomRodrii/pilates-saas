import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calcularRacha, claveMesActual, objetivoMensualAlcanzado } from './streak-engine.ts';
import type { Reserva, Sesion } from '../types.ts';

// ⚠️ Este motor NO tenía ni un test, y alimenta el de logros
// (`achievement-engine.ts`) y los créditos de «semana completa». Estos casos
// llegaron aquí desde un segundo cálculo que se escribió para el Inicio del
// tema Tentada y se retiró al descubrir que esta función ya hacía lo mismo:
// mejor consolidar y probar la que ya tenía dueño.

// El 1 de agosto de 2026 cae en sábado, así que los lunes son 3, 10, 27 jul…
const AHORA = new Date('2026-08-13T10:00:00Z'); // jueves
const SES: Sesion[] = [
  { id: 's0', inicio: '2026-08-11T09:00:00Z' }, // semana en curso (lunes 10)
  { id: 's1', inicio: '2026-08-05T09:00:00Z' }, // semana -1
  { id: 's2', inicio: '2026-07-29T09:00:00Z' }, // semana -2
  { id: 's4', inicio: '2026-07-15T09:00:00Z' }, // semana -4 (hueco en la -3)
  { id: 's5', inicio: '2026-07-08T09:00:00Z' }, // semana -5
  { id: 's6', inicio: '2026-07-01T09:00:00Z' }, // semana -6
].map((s) => ({ ...s, fin: s.inicio }) as Sesion);

const asistio = (...ids: string[]): Reserva[] =>
  ids.map((sesionId) => ({ sesionId, estado: 'ASISTIDA' }) as Reserva);

test('calcularRacha: tres semanas seguidas asistiendo', () => {
  assert.equal(calcularRacha(asistio('s0', 's1', 's2'), SES, AHORA).semanas, 3);
});

test('calcularRacha: reservar NO es venir — solo cuenta ASISTIDA', () => {
  // La regresión que más engaña: con CONFIRMADA la racha se la inventaría
  // quien reserva y no aparece, y de ahí saldrían insignias sin ir a clase.
  const soloReservado = ['s0', 's1', 's2'].map((sesionId) => ({ sesionId, estado: 'CONFIRMADA' }) as Reserva);
  assert.equal(calcularRacha(soloReservado, SES, AHORA).semanas, 0);
});

test('calcularRacha: la semana EN CURSO vacía no rompe la racha, pero avisa', () => {
  // Es jueves y aún no ha ido esta semana. Si contara como semana en blanco,
  // la racha se pondría a cero cada lunes y volvería al día siguiente.
  const r = calcularRacha(asistio('s1', 's2'), SES, AHORA);
  assert.equal(r.semanas, 2);
  assert.equal(r.enRiesgo, true);
  // Del jueves 13 al domingo 16 a las 23:59 quedan 4 días, no 3: el plazo
  // llega al FINAL del domingo. (Escribí 3 y el test me corrigió.)
  assert.equal(r.diasParaPerder, 4);
});

test('calcularRacha: con la semana en curso hecha, no hay riesgo', () => {
  const r = calcularRacha(asistio('s0', 's1'), SES, AHORA);
  assert.equal(r.enRiesgo, false);
  assert.equal(r.diasParaPerder, null);
});

test('calcularRacha: sin asistencias, cero y sin riesgo', () => {
  const r = calcularRacha([], SES, AHORA);
  assert.equal(r.semanas, 0);
  assert.equal(r.enRiesgo, false);
  assert.equal(r.esMejor, false);
});

test('calcularRacha: una reserva cuya sesión no está cargada se ignora, no rompe', () => {
  assert.equal(calcularRacha(asistio('s0', 's1', 'fantasma'), SES, AHORA).semanas, 2);
});

// ── `esMejor`: lo pide el Inicio de Tentada, y es comprobable ──────────────

test('esMejor: su racha actual ES la más larga que ha tenido', () => {
  assert.equal(calcularRacha(asistio('s0', 's1', 's2'), SES, AHORA).esMejor, true);
});

test('esMejor: false cuando encadenó más en el pasado', () => {
  // Ahora lleva 2 seguidas (semanas -1 y -2), pero en julio encadenó 3
  // (-4, -5, -6). No es su mejor marca y no se le dice que lo sea.
  const r = calcularRacha(asistio('s1', 's2', 's4', 's5', 's6'), SES, AHORA);
  assert.equal(r.semanas, 2);
  assert.equal(r.esMejor, false);
});

test('esMejor: empatar con su mejor marca SÍ cuenta', () => {
  // Dos tramos de dos. Igualar la mejor no es peor que la mejor.
  const r = calcularRacha(asistio('s1', 's2', 's5', 's6'), SES, AHORA);
  assert.equal(r.semanas, 2);
  assert.equal(r.esMejor, true);
});

// -- objetivoMensualAlcanzado / claveMesActual (I-1, auditoria 49a) --------

const SES_MES: Sesion[] = [
  { id: 'm0', inicio: '2026-08-11T09:00:00Z' }, // agosto, ya paso
  { id: 'm1', inicio: '2026-08-05T09:00:00Z' }, // agosto, ya paso
  { id: 'm2', inicio: '2026-07-29T09:00:00Z' }, // julio -- mes distinto
  { id: 'mF', inicio: '2026-08-20T09:00:00Z' }, // agosto, TODAVIA no ha pasado
].map((s) => ({ ...s, fin: s.inicio }) as Sesion);

const reservaAsistida = (sesionId: string): Reserva => ({ sesionId, estado: 'ASISTIDA' }) as Reserva;
const reservaConfirmada = (sesionId: string): Reserva => ({ sesionId, estado: 'CONFIRMADA' }) as Reserva;

test('objetivoMensualAlcanzado: sin objetivo (null/undefined) nunca es true', () => {
  const dosAsistidas = [reservaAsistida('m0'), reservaAsistida('m1')];
  assert.equal(objetivoMensualAlcanzado(dosAsistidas, SES_MES, null, AHORA), false);
  assert.equal(objetivoMensualAlcanzado(dosAsistidas, SES_MES, undefined, AHORA), false);
});

test('objetivoMensualAlcanzado: alcanza el objetivo con ASISTIDAS de este mes', () => {
  const dosAsistidas = [reservaAsistida('m0'), reservaAsistida('m1')];
  assert.equal(objetivoMensualAlcanzado(dosAsistidas, SES_MES, 2, AHORA), true);
});

test('objetivoMensualAlcanzado: no alcanza si faltan clases', () => {
  const dosAsistidas = [reservaAsistida('m0'), reservaAsistida('m1')];
  assert.equal(objetivoMensualAlcanzado(dosAsistidas, SES_MES, 3, AHORA), false);
});

test('objetivoMensualAlcanzado: CONFIRMADA con la sesion ya pasada SI cuenta', () => {
  const confirmadaPasada = [reservaConfirmada('m0')];
  assert.equal(objetivoMensualAlcanzado(confirmadaPasada, SES_MES, 1, AHORA), true);
});

test('objetivoMensualAlcanzado: CONFIRMADA con la sesion TODAVIA no pasada NO cuenta', () => {
  // Reservar no es venir: mismo criterio que ya prueba calcularRacha arriba,
  // aplicado a la sesion futura de este mes en vez de a un estado distinto.
  const confirmadaFutura = [reservaConfirmada('mF')];
  assert.equal(objetivoMensualAlcanzado(confirmadaFutura, SES_MES, 1, AHORA), false);
});

test('objetivoMensualAlcanzado: una ASISTIDA de OTRO mes no cuenta para el mes en curso', () => {
  const asistidaJulio = [reservaAsistida('m2')];
  assert.equal(objetivoMensualAlcanzado(asistidaJulio, SES_MES, 1, AHORA), false);
});

test('objetivoMensualAlcanzado: una reserva cuya sesion no esta cargada se ignora', () => {
  const conFantasma = [reservaAsistida('m0'), reservaAsistida('fantasma')];
  assert.equal(objetivoMensualAlcanzado(conFantasma, SES_MES, 2, AHORA), false);
});

test('claveMesActual: formato YYYY-MM, mismo que to_char(current_date, YYYY-MM) en SQL', () => {
  assert.equal(claveMesActual(AHORA), '2026-08');
  assert.equal(claveMesActual(new Date('2026-01-05T00:00:00Z')), '2026-01');
});
