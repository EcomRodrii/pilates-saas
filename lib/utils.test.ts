// Tests de los formateadores de fecha/hora DEL ESTUDIO. Runner nativo: `npm test`.
//
// Por qué existen: la cadena que se le manda a una alumna ("tu clase es el
// sábado a las 09:00") se construía a mano en cinco sitios del panel, y solo
// UNA de las copias pasaba `timeZone`. Resultado: editar una serie mandaba la
// hora del estudio y editar esa misma clase suelta mandaba la del navegador de
// quien estaba editando. Mismo aviso, dos horas distintas.
//
// Estos tests fijan lo que importa: el resultado NO depende de la zona horaria
// de la máquina que ejecuta el código, solo del instante. Por eso se comprueban
// las dos mitades del año — en verano Madrid es UTC+2 y en invierno UTC+1, así
// que un formateo que ignorase la zona fallaría en al menos uno de los dos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cuandoEstudio, fechaLargaEstudio, horaEstudio, TZ_ESTUDIO } from './utils.ts';

test('la zona del estudio es la peninsular', () => {
  assert.equal(TZ_ESTUDIO, 'Europe/Madrid');
});

test('verano: 13:00 UTC son las 15:00 en el estudio (UTC+2)', () => {
  assert.equal(horaEstudio('2026-08-08T13:00:00+00:00'), '15:00');
});

test('invierno: 13:00 UTC son las 14:00 en el estudio (UTC+1)', () => {
  assert.equal(horaEstudio('2026-01-15T13:00:00+00:00'), '14:00');
});

test('acepta las dos formas de escribir el mismo instante (Postgres y toISOString)', () => {
  // Postgres devuelve "+00:00" y `Date.toISOString()` devuelve "Z": misma hora.
  assert.equal(
    horaEstudio('2026-08-08T13:00:00+00:00'),
    horaEstudio('2026-08-08T13:00:00.000Z'),
  );
});

test('el día es el del estudio, no el de UTC', () => {
  // 23:30 UTC del 7 de agosto ya es día 8 en Madrid (UTC+2).
  assert.equal(fechaLargaEstudio('2026-08-07T23:30:00+00:00'), 'sábado, 8 de agosto');
});

test('cuandoEstudio compone fecha y hora del estudio', () => {
  assert.equal(cuandoEstudio('2026-08-08T07:00:00+00:00'), 'sábado, 8 de agosto a las 09:00');
});

test('acepta Date además de cadena (los llamadores usan las dos)', () => {
  assert.equal(
    cuandoEstudio(new Date('2026-08-08T07:00:00+00:00')),
    cuandoEstudio('2026-08-08T07:00:00+00:00'),
  );
});
