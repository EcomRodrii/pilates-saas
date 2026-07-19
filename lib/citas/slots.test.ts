import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generarHuecosDia, dentroDeDisponibilidad, horaParedAInstante,
  diaSemanaLocal, fechaLocalDe, type FranjaDisponibilidad,
} from './slots.ts';

// 2026-01-12 es LUNES (DOW 1). Enero → Madrid en horario de invierno (UTC+1).
const LUNES = '2026-01-12';
// 2026-07-13 es LUNES en verano (DOW 1). Julio → Madrid en DST (UTC+2).
const LUNES_VERANO = '2026-07-13';

// Franja lunes 09:00–12:00.
const franjaLunes: FranjaDisponibilidad = { diaSemana: 1, horaInicio: '09:00', horaFin: '12:00' };

// "Ahora" muy en el pasado, para no descartar huecos por antigüedad.
const AYER = new Date('2020-01-01T00:00:00Z');

test('diaSemanaLocal usa convención Postgres DOW (0=domingo)', () => {
  assert.equal(diaSemanaLocal('2026-01-11'), 0); // domingo
  assert.equal(diaSemanaLocal('2026-01-12'), 1); // lunes
  assert.equal(diaSemanaLocal('2026-01-17'), 6); // sábado
});

test('horaParedAInstante ancla a Madrid: invierno UTC+1', () => {
  // 09:00 Madrid en enero = 08:00 UTC.
  assert.equal(horaParedAInstante(LUNES, '09:00').toISOString(), '2026-01-12T08:00:00.000Z');
});

test('horaParedAInstante respeta el DST: verano UTC+2', () => {
  // 09:00 Madrid en julio = 07:00 UTC.
  assert.equal(horaParedAInstante(LUNES_VERANO, '09:00').toISOString(), '2026-07-13T07:00:00.000Z');
});

test('fechaLocalDe devuelve la fecha de pared en Madrid', () => {
  // 23:30 UTC del 11-ene = 00:30 del 12-ene en Madrid.
  assert.equal(fechaLocalDe(new Date('2026-01-11T23:30:00Z')), '2026-01-12');
});

test('generarHuecosDia parte la franja por la duración (paso = duración)', () => {
  const huecos = generarHuecosDia({
    fechaLocal: LUNES, franjas: [franjaLunes], duracionMin: 60, ahora: AYER,
  });
  // 09–12 en huecos de 60min → 09, 10, 11 (Madrid) = 08,09,10 UTC.
  assert.deepEqual(huecos.map(h => h.inicio), [
    '2026-01-12T08:00:00.000Z',
    '2026-01-12T09:00:00.000Z',
    '2026-01-12T10:00:00.000Z',
  ]);
  assert.equal(huecos[0].fin, '2026-01-12T09:00:00.000Z');
});

test('generarHuecosDia respeta un paso menor que la duración', () => {
  const huecos = generarHuecosDia({
    fechaLocal: LUNES, franjas: [franjaLunes], duracionMin: 60, pasoMin: 30, ahora: AYER,
  });
  // Paso 30, duración 60: 09:00, 09:30, 10:00, 10:30, 11:00 (último acaba 12:00).
  assert.equal(huecos.length, 5);
  assert.equal(huecos[1].inicio, '2026-01-12T08:30:00.000Z');
});

test('generarHuecosDia no genera un hueco que se sale de la franja', () => {
  const huecos = generarHuecosDia({
    fechaLocal: LUNES, franjas: [{ diaSemana: 1, horaInicio: '09:00', horaFin: '10:30' }],
    duracionMin: 60, ahora: AYER,
  });
  // Solo cabe 09:00–10:00 (el siguiente sería 10:00–11:00, se pasa de 10:30).
  assert.deepEqual(huecos.map(h => h.inicio), ['2026-01-12T08:00:00.000Z']);
});

test('generarHuecosDia resta los intervalos ocupados (solape parcial también)', () => {
  const huecos = generarHuecosDia({
    fechaLocal: LUNES, franjas: [franjaLunes], duracionMin: 60, ahora: AYER,
    ocupados: [{ inicio: '2026-01-12T09:15:00.000Z', fin: '2026-01-12T09:45:00.000Z' }],
  });
  // El ocupado 10:15–10:45 Madrid solapa el hueco de 10:00–11:00 (09:00–10:00 UTC).
  assert.deepEqual(huecos.map(h => h.inicio), [
    '2026-01-12T08:00:00.000Z',
    '2026-01-12T10:00:00.000Z',
  ]);
});

test('generarHuecosDia descarta huecos ya pasados según ahora', () => {
  const huecos = generarHuecosDia({
    fechaLocal: LUNES, franjas: [franjaLunes], duracionMin: 60,
    ahora: new Date('2026-01-12T09:30:00.000Z'), // 10:30 Madrid
  });
  // Solo el hueco de 11:00 Madrid (10:00 UTC) empieza tras "ahora".
  assert.deepEqual(huecos.map(h => h.inicio), ['2026-01-12T10:00:00.000Z']);
});

test('generarHuecosDia ignora franjas de otro día de la semana', () => {
  const huecos = generarHuecosDia({
    fechaLocal: LUNES, // lunes
    franjas: [{ diaSemana: 3, horaInicio: '09:00', horaFin: '12:00' }], // miércoles
    duracionMin: 60, ahora: AYER,
  });
  assert.equal(huecos.length, 0);
});

test('generarHuecosDia combina y ordena varias franjas del mismo día', () => {
  const huecos = generarHuecosDia({
    fechaLocal: LUNES, duracionMin: 60, ahora: AYER,
    franjas: [
      { diaSemana: 1, horaInicio: '16:00', horaFin: '18:00' },
      { diaSemana: 1, horaInicio: '09:00', horaFin: '11:00' },
    ],
  });
  assert.deepEqual(huecos.map(h => h.inicio), [
    '2026-01-12T08:00:00.000Z', // 09:00
    '2026-01-12T09:00:00.000Z', // 10:00
    '2026-01-12T15:00:00.000Z', // 16:00
    '2026-01-12T16:00:00.000Z', // 17:00
  ]);
});

test('dentroDeDisponibilidad acepta un hueco válido y rechaza fuera de franja', () => {
  // 10:00–11:00 Madrid (09:00–10:00 UTC) el lunes: dentro de 09:00–12:00.
  assert.equal(dentroDeDisponibilidad({
    inicioISO: '2026-01-12T09:00:00.000Z', finISO: '2026-01-12T10:00:00.000Z',
    franjas: [franjaLunes],
  }), true);
  // 12:30–13:30 Madrid: fuera de la franja.
  assert.equal(dentroDeDisponibilidad({
    inicioISO: '2026-01-12T11:30:00.000Z', finISO: '2026-01-12T12:30:00.000Z',
    franjas: [franjaLunes],
  }), false);
});

test('dentroDeDisponibilidad rechaza si el día de la semana no coincide', () => {
  // Martes 13-ene, aunque la hora encaje, la franja es de lunes.
  assert.equal(dentroDeDisponibilidad({
    inicioISO: '2026-01-13T09:00:00.000Z', finISO: '2026-01-13T10:00:00.000Z',
    franjas: [franjaLunes],
  }), false);
});

test('dentroDeDisponibilidad rechaza intervalos degenerados', () => {
  assert.equal(dentroDeDisponibilidad({
    inicioISO: '2026-01-12T09:00:00.000Z', finISO: '2026-01-12T09:00:00.000Z',
    franjas: [franjaLunes],
  }), false);
});
