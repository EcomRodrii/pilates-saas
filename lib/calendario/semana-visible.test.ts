import { test } from 'node:test';
import assert from 'node:assert/strict';
import { semanaQueMuestra } from './semana-visible.ts';

const d = (s: string) => new Date(`${s}T00:00:00`);
const clave = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const HOY = new Date('2026-09-16T15:08:00'); // miércoles

test('saltar a una clase de mañana no saca hoy de la semana (el fallo que vio la dueña)', () => {
  const semana = semanaQueMuestra(new Date('2026-09-17T10:00:00'), d('2026-09-16'), HOY);
  assert.equal(clave(semana), '2026-09-16');
});

test('si el día ya se ve, la semana no se mueve aunque no empiece hoy', () => {
  const navegada = d('2026-09-23');
  assert.equal(semanaQueMuestra(new Date('2026-09-27T18:00:00'), navegada, HOY), navegada);
});

test('desde otra semana, un día de los próximos 7 vuelve a la semana que empieza hoy', () => {
  const semana = semanaQueMuestra(new Date('2026-09-21T09:00:00'), d('2026-10-07'), HOY);
  assert.equal(clave(semana), '2026-09-16');
});

test('el séptimo día cuenta; el octavo ya no', () => {
  assert.equal(clave(semanaQueMuestra(new Date('2026-09-22T20:00:00'), d('2026-10-07'), HOY)), '2026-09-16');
  assert.equal(clave(semanaQueMuestra(new Date('2026-09-23T08:00:00'), d('2026-10-07'), HOY)), '2026-09-23');
});

test('un día lejano o pasado sí mueve la semana a ese día, a medianoche', () => {
  const lejos = semanaQueMuestra(new Date('2026-11-04T19:30:00'), d('2026-09-16'), HOY);
  assert.equal(clave(lejos), '2026-11-04');
  assert.equal(lejos.getHours(), 0);
  assert.equal(clave(semanaQueMuestra(new Date('2026-09-10T10:00:00'), d('2026-09-16'), HOY)), '2026-09-10');
});

test('el cambio de hora de octubre no descuadra la cuenta de días', () => {
  const hoy = new Date('2026-10-22T12:00:00');
  assert.equal(clave(semanaQueMuestra(new Date('2026-10-28T09:00:00'), d('2026-11-10'), hoy)), '2026-10-22');
});
