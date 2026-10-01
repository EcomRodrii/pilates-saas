import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ausenciaDeSesion, bloqueoPisaSesion, diaLocalDe, textoAusencia, type BloqueoAgenda } from './ausencias.ts';

// Martes 6 de octubre de 2026, 19:15–20:05 en Madrid (UTC+2).
const CLASE = { instructorId: 'ins-lucia', inicio: '2026-10-06T17:15:00.000Z', fin: '2026-10-06T18:05:00.000Z' };
const VACACIONES = new Map([['aus-1', { tipo: 'VACACIONES', desde: '2026-10-02', hasta: '2026-10-09' }]]);

test('el día del bloqueo es el del estudio, no el del servidor', () => {
  // 00:30 en Madrid sigue siendo el día 7 aunque en UTC sea el 6.
  assert.equal(diaLocalDe('2026-10-06T22:30:00.000Z'), '2026-10-07');
  assert.equal(diaLocalDe(CLASE.inicio), '2026-10-06');
});

test('un bloqueo sin horas pisa el día entero; con horas, solo lo que se solapa', () => {
  const ini = new Date(CLASE.inicio), fin = new Date(CLASE.fin);
  assert.equal(bloqueoPisaSesion({ horaInicio: null, horaFin: null }, ini, fin), true);
  assert.equal(bloqueoPisaSesion({ horaInicio: '19:00', horaFin: '19:30' }, ini, fin), true);
  assert.equal(bloqueoPisaSesion({ horaInicio: '09:00', horaFin: '14:00' }, ini, fin), false);
  // Acaba justo cuando empieza la clase: no la pisa.
  assert.equal(bloqueoPisaSesion({ horaInicio: '18:00', horaFin: '19:15' }, ini, fin), false);
});

test('las vacaciones dejan la clase sin su instructora, con su tipo y sus fechas', () => {
  const bloqueos: BloqueoAgenda[] = [{ instructorId: 'ins-lucia', fecha: '2026-10-06', horaInicio: null, horaFin: null, ausenciaId: 'aus-1' }];
  assert.deepEqual(ausenciaDeSesion(CLASE, bloqueos, VACACIONES), { tipo: 'VACACIONES', desde: '2026-10-02', hasta: '2026-10-09' });
});

test('un bloqueo suelto (sin ausencia detrás) cuenta como «no está disponible» ese día', () => {
  const bloqueos: BloqueoAgenda[] = [{ instructorId: 'ins-lucia', fecha: '2026-10-06', horaInicio: '18:00', horaFin: '21:00', ausenciaId: null }];
  assert.deepEqual(ausenciaDeSesion(CLASE, bloqueos, new Map()), { tipo: 'OTRO', desde: '2026-10-06', hasta: '2026-10-06' });
});

test('el bloqueo de OTRA instructora o de otro día no toca la clase', () => {
  const bloqueos: BloqueoAgenda[] = [
    { instructorId: 'ins-marta', fecha: '2026-10-06', horaInicio: null, horaFin: null, ausenciaId: 'aus-1' },
    { instructorId: 'ins-lucia', fecha: '2026-10-07', horaInicio: null, horaFin: null, ausenciaId: 'aus-1' },
  ];
  assert.equal(ausenciaDeSesion(CLASE, bloqueos, VACACIONES), null);
  assert.equal(ausenciaDeSesion({ ...CLASE, instructorId: null }, bloqueos, VACACIONES), null);
});

test('un tipo de ausencia desconocido se cuenta como «no está disponible»', () => {
  const bloqueos: BloqueoAgenda[] = [{ instructorId: 'ins-lucia', fecha: '2026-10-06', horaInicio: null, horaFin: null, ausenciaId: 'aus-x' }];
  const raras = new Map([['aus-x', { tipo: 'FORMACION', desde: '2026-10-06', hasta: '2026-10-06' }]]);
  assert.equal(ausenciaDeSesion(CLASE, bloqueos, raras)?.tipo, 'OTRO');
  assert.equal(textoAusencia('VACACIONES'), 'de vacaciones');
  assert.equal(textoAusencia('BAJA_MEDICA'), 'de baja');
  assert.equal(textoAusencia('OTRO'), 'no está disponible');
});
