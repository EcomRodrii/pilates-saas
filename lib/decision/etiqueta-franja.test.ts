import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etiquetaFranja } from './senales.ts';

// El día y la hora con que los especialistas nombran una franja, en hora del
// estudio (Madrid), con la medianoche UTC y los dos cambios de hora.

test('medianoche UTC: en verano ya son las 02:00 del día siguiente en Madrid', () => {
  assert.deepEqual(etiquetaFranja('2026-07-13T00:00:00.000Z'), { diaSemana: 'lunes', hora: '02:00' });
});

test('medianoche UTC en invierno: la 01:00 del día siguiente', () => {
  assert.deepEqual(etiquetaFranja('2026-01-12T00:00:00.000Z'), { diaSemana: 'lunes', hora: '01:00' });
});

test('cambio de hora de primavera (29-mar-2026, a las 02:00 pasa a ser las 03:00)', () => {
  assert.deepEqual(etiquetaFranja('2026-03-29T00:30:00.000Z'), { diaSemana: 'domingo', hora: '01:30' });
  assert.deepEqual(etiquetaFranja('2026-03-29T01:30:00.000Z'), { diaSemana: 'domingo', hora: '03:30' });
  assert.deepEqual(etiquetaFranja('2026-03-29T18:00:00.000Z'), { diaSemana: 'domingo', hora: '20:00' });
});

test('cambio de hora de otoño (25-oct-2026, a las 03:00 vuelve a ser las 02:00)', () => {
  assert.deepEqual(etiquetaFranja('2026-10-25T00:30:00.000Z'), { diaSemana: 'domingo', hora: '02:30' });
  assert.deepEqual(etiquetaFranja('2026-10-25T01:30:00.000Z'), { diaSemana: 'domingo', hora: '02:30' });
  assert.deepEqual(etiquetaFranja('2026-10-25T19:00:00.000Z'), { diaSemana: 'domingo', hora: '20:00' });
});
