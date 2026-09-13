import { test } from 'node:test';
import assert from 'node:assert/strict';

import { celdasDesdeClases } from './disponibilidad-desde-clases.ts';

const h = (hh: number, mm = 0) => hh * 60 + mm;

test('una clase dentro de una franja marca solo esa franja', () => {
  // Martes 20:00-20:50 → última hora del martes.
  assert.deepEqual([...celdasDesdeClases([{ dow: 2, inicioMin: h(20), finMin: h(20, 50) }])], ['2-noche']);
});

test('una clase que cruza un corte marca las dos franjas', () => {
  // Lunes 09:30-10:30 → primera hora y media mañana.
  const r = celdasDesdeClases([{ dow: 1, inicioMin: h(9, 30), finMin: h(10, 30) }]);
  assert.deepEqual([...r].sort(), ['1-manana', '1-media_manana']);
});

test('acabar justo en el corte no marca la franja siguiente', () => {
  // Jueves 09:00-10:00 → solo primera hora.
  assert.deepEqual([...celdasDesdeClases([{ dow: 4, inicioMin: h(9), finMin: h(10) }])], ['4-manana']);
});

test('varias clases del mismo hueco no duplican celdas', () => {
  const r = celdasDesdeClases([
    { dow: 3, inicioMin: h(18), finMin: h(18, 50) },
    { dow: 3, inicioMin: h(19), finMin: h(19, 50) },
  ]);
  assert.deepEqual([...r], ['3-noche']);
});

test('sin clases no marca nada', () => {
  assert.equal(celdasDesdeClases([]).size, 0);
});

test('una clase que pasa de medianoche se queda en su día, hasta el cierre', () => {
  assert.deepEqual([...celdasDesdeClases([{ dow: 5, inicioMin: h(23), finMin: h(0, 30) }])], ['5-noche']);
});
