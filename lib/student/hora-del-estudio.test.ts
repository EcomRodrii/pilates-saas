// ⚠️ LA ZONA DEL PROCESO SE FIJA A PROPÓSITO, Y ANTES DE IMPORTAR NADA.
//
// Estos tests existen por un fallo que en una máquina española es INVISIBLE:
// `horaAhora` se construía con `new Date().getHours()` —el reloj del
// dispositivo— y se comparaba contra horas que vienen todas en la zona del
// estudio (`Clase.hora` sale de `horaLocal`, Europe/Madrid;
// `plazas_fijas.hora_inicio` es el horario del estudio). En Madrid las dos
// respuestas coinciden y no pasa nada; fuera, la socia ve como «próxima» una
// clase que ya ha empezado.
//
// La primera versión de estos tests vivía en `formato.test.ts` y pasaba
// IGUAL con el fallo puesto, porque mi portátil va en hora de Madrid. Un test
// que solo puede fallar en CI no es un guardia, es una lotería. Con una zona
// de proceso distinta a la del estudio, falla donde esté el error.
process.env.TZ = 'America/New_York';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { horaAhora } from './formato.ts';

test('da la hora del ESTUDIO, no la del proceso', () => {
  // 06:00Z = 08:00 en Madrid (CEST) y 02:00 en Nueva York, que es la zona del
  // proceso: si saliera «02:00» estaría leyendo el reloj equivocado.
  assert.equal(horaAhora(new Date('2026-08-12T06:00:00Z')), '08:00');
});

test('el desfase NO se puede fijar: en invierno Madrid va a UTC+1', () => {
  assert.equal(horaAhora(new Date('2026-01-12T06:00:00Z')), '07:00');
});

test('sirve para comparar como cadena con una hora del horario', () => {
  // Es todo su propósito: `'09:05' < '10:00'` solo es cierto con el cero
  // a la izquierda.
  const h = horaAhora(new Date('2026-08-12T07:05:00Z'));
  assert.equal(h, '09:05');
  assert.ok(h < '10:00');
});

test('a medianoche de Madrid da 00:00 y no 24:00', () => {
  // '24:00' es mayor que cualquier hora del horario: dejaría a la socia sin
  // ninguna «próxima» clase de hoy durante esa hora.
  assert.equal(horaAhora(new Date('2026-08-11T22:00:00Z')), '00:00');
});
