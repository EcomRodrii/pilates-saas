import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cuandoSeAbre, mensajeTodaviaNoSeAbre } from './apertura-texto.ts';

// Martes 29-sep-2026 a las 10:00 en Madrid.
const AHORA = new Date('2026-09-29T10:00:00+02:00');

test('hoy, mañana o la fecha, siempre en hora del estudio', () => {
  assert.equal(cuandoSeAbre(new Date('2026-09-29T20:00:00+02:00'), AHORA), 'hoy a las 20:00');
  assert.equal(cuandoSeAbre(new Date('2026-09-30T20:00:00+02:00'), AHORA), 'mañana a las 20:00');
  assert.equal(cuandoSeAbre(new Date('2026-10-02T20:00:00+02:00'), AHORA), 'el viernes, 2 de octubre, a las 20:00');
  // 00:30 de Madrid es aún el día anterior en UTC: cuenta el del estudio.
  assert.equal(cuandoSeAbre(new Date('2026-09-30T00:30:00+02:00'), AHORA), 'mañana a las 00:30');
});

test('el mensaje del servidor dice cuándo volver', () => {
  assert.equal(
    mensajeTodaviaNoSeAbre(new Date('2026-09-30T20:00:00+02:00'), AHORA),
    'Todavía no se puede reservar esta clase: se abre mañana a las 20:00.',
  );
});
