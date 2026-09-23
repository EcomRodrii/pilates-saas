import test from 'node:test';
import assert from 'node:assert/strict';
import { enEstudio, minutosEnEstudio, diaEnEstudio } from './calendario-hora-estudio.ts';

// RES-2: día y minuto DEL ESTUDIO (Europe/Madrid), nunca los del huso del
// proceso. Estos casos se comprueban también arrancando el runner con
// TZ=UTC y TZ=America/Los_Angeles: el resultado tiene que ser el mismo.

test('verano (CEST, +2): 08:00 UTC son las 10:00 del estudio', () => {
  assert.deepEqual(enEstudio('2026-09-24T08:00:00.000Z'), { dia: '2026-09-24', minutos: 600 });
});

test('invierno (CET, +1): 09:00 UTC son las 10:00 del estudio', () => {
  assert.deepEqual(enEstudio('2026-01-15T09:00:00.000Z'), { dia: '2026-01-15', minutos: 600 });
});

test('⚠️ la medianoche del estudio cambia de DÍA, no solo de minuto', () => {
  // 22:30 UTC del 23 son las 00:30 del 24 en Madrid: el día del estudio es
  // el 24 aunque el día UTC (y el de un navegador en América) sea el 23.
  assert.deepEqual(enEstudio('2026-09-23T22:30:00.000Z'), { dia: '2026-09-24', minutos: 30 });
  assert.deepEqual(enEstudio('2026-09-23T21:59:00.000Z'), { dia: '2026-09-23', minutos: 1439 });
});

test('las 00:00 en punto son el minuto 0, no el 1440', () => {
  assert.deepEqual(enEstudio('2026-09-23T22:00:00.000Z'), { dia: '2026-09-24', minutos: 0 });
});

test('el cambio de hora de primavera: 00:59 UTC son las 01:59 y 01:00 UTC ya las 03:00', () => {
  assert.equal(minutosEnEstudio('2026-03-29T00:59:00.000Z'), 1 * 60 + 59);
  assert.equal(minutosEnEstudio('2026-03-29T01:00:00.000Z'), 3 * 60);
});

test('el cambio de hora de otoño: la misma hora de pared se repite, y cada instante cae en su sitio', () => {
  // 2026-10-25: a las 03:00 CEST (01:00 UTC) se vuelve a las 02:00 CET.
  assert.equal(minutosEnEstudio('2026-10-25T00:30:00.000Z'), 2 * 60 + 30); // 02:30 CEST
  assert.equal(minutosEnEstudio('2026-10-25T01:30:00.000Z'), 2 * 60 + 30); // 02:30 CET
});

test('acepta Date, número y cadena ISO, y da lo mismo', () => {
  const iso = '2026-09-24T08:00:00.000Z';
  assert.deepEqual(enEstudio(new Date(iso)), enEstudio(iso));
  assert.deepEqual(enEstudio(new Date(iso).getTime()), enEstudio(iso));
  assert.equal(minutosEnEstudio(iso), 600);
  assert.equal(diaEnEstudio(iso), '2026-09-24');
});

test('una fecha inválida no lanza en pleno render: NaN y día vacío, como el getHours() de antes', () => {
  assert.deepEqual(enEstudio('no es una fecha'), { dia: '', minutos: NaN });
  assert.ok(Number.isNaN(minutosEnEstudio('')));
});
