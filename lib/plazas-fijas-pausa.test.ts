import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoPausa, fechaEnPausa, pausaDe, sesionEnPausa, textoTrasPausa, validarPausa } from './plazas-fijas-pausa.ts';

const HOY = '2026-08-05';
const VACACIONES = { pausaDesde: '2026-08-10', pausaHasta: '2026-08-23' };

test('pausaDe: solo hay pausa con las dos fechas', () => {
  assert.deepEqual(pausaDe(VACACIONES), { desde: '2026-08-10', hasta: '2026-08-23' });
  assert.equal(pausaDe({}), null);
  assert.equal(pausaDe({ pausaDesde: '2026-08-10', pausaHasta: null }), null);
});

test('fechaEnPausa incluye los dos extremos', () => {
  assert.equal(fechaEnPausa(VACACIONES, '2026-08-09'), false);
  assert.equal(fechaEnPausa(VACACIONES, '2026-08-10'), true);
  assert.equal(fechaEnPausa(VACACIONES, '2026-08-23'), true);
  assert.equal(fechaEnPausa(VACACIONES, '2026-08-24'), false);
  assert.equal(fechaEnPausa({}, '2026-08-10'), false);
});

test('sesionEnPausa mira la fecha en el estudio, no la UTC', () => {
  // 23:30 UTC del día 9 = 01:30 del día 10 en Madrid (verano, UTC+2).
  assert.equal(sesionEnPausa(VACACIONES, '2026-08-09T23:30:00Z'), true);
  // 22:30 UTC del día 23 = 00:30 del día 24: ya fuera.
  assert.equal(sesionEnPausa(VACACIONES, '2026-08-23T22:30:00Z'), false);
});

test('estadoPausa: programada, en curso (incluido el último día) y terminada', () => {
  assert.equal(estadoPausa(VACACIONES, HOY), 'programada');
  assert.equal(estadoPausa(VACACIONES, '2026-08-10'), 'en_curso');
  assert.equal(estadoPausa(VACACIONES, '2026-08-23'), 'en_curso');
  assert.equal(estadoPausa(VACACIONES, '2026-08-24'), 'sin_pausa');
  assert.equal(estadoPausa({}, HOY), 'sin_pausa');
});

test('validarPausa', () => {
  assert.equal(validarPausa('2026-08-10', '2026-08-23', HOY), null);
  // Cambiar una pausa que ya empezó: «desde» en el pasado vale.
  assert.equal(validarPausa('2026-08-01', '2026-08-10', HOY), null);
  assert.equal(validarPausa('', '2026-08-23', HOY), 'Elige las dos fechas de la pausa.');
  assert.equal(validarPausa('2026-02-30', '2026-03-02', '2026-01-01'), 'Elige las dos fechas de la pausa.');
  assert.equal(validarPausa('2026-08-23', '2026-08-10', HOY), '«Hasta» no puede ser anterior a «Desde».');
  assert.equal(validarPausa('2026-07-01', '2026-08-04', HOY), 'Esa pausa ya habría terminado: elige fechas de hoy en adelante.');
  assert.equal(validarPausa(HOY, '2027-08-05', HOY), null); // 366 días justos
  assert.match(validarPausa(HOY, '2027-08-06', HOY) ?? '', /no puede pasar de un año/);
  assert.match(validarPausa('2099-01-01', '2099-01-10', HOY) ?? '', /dentro de más de un año/);
});

test('textoTrasPausa cuenta lo que ha hecho el servidor', () => {
  const pausa = { desde: '2026-08-10', hasta: '2026-08-23' };
  assert.equal(
    textoTrasPausa({ canceladas: 2, mantenidas: 1, fallidas: 0, creadas: 0 }, pausa),
    'Plaza fija en pausa del 10/08/2026 al 23/08/2026 · 2 clases canceladas · 1 se mantiene por estar dentro del plazo de cancelación',
  );
  assert.equal(
    textoTrasPausa({ canceladas: 0, mantenidas: 0, fallidas: 1, creadas: 0 }, pausa),
    'Plaza fija en pausa del 10/08/2026 al 23/08/2026 · 1 no se pudo cancelar: revísala en el calendario',
  );
  assert.equal(textoTrasPausa({ canceladas: 0, mantenidas: 0, fallidas: 0, creadas: 1 }, null), 'Pausa quitada · 1 clase reservada de nuevo');
  assert.equal(textoTrasPausa({ canceladas: 0, mantenidas: 0, fallidas: 0, creadas: 0 }, null), 'Pausa quitada');
});
