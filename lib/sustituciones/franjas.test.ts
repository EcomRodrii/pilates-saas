import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRANJAS, franjaPorHoraInicio, celdaKey, parseCeldaKey } from './franjas.ts';

test('las franjas cubren el día sin huecos ni solapes', () => {
  for (let i = 1; i < FRANJAS.length; i++) {
    assert.equal(FRANJAS[i].horaInicio, FRANJAS[i - 1].horaFin,
      `la franja «${FRANJAS[i].label}» debe empezar donde acaba «${FRANJAS[i - 1].label}»`);
  }
});

test('separa la primera hora de la media mañana', () => {
  // El caso que motivó el cambio: quien puede a las 12:00 pero no a las 09:00
  // ya no tiene que marcar la mañana entera.
  assert.notEqual(franjaPorHoraInicio('09:00'), franjaPorHoraInicio('12:00'));
});

// Regresión: con la comparación exacta de antes, una disponibilidad guardada
// con la rejilla vieja ('20:00') no casaba con ninguna franja nueva y la
// instructora abría su enlace y veía la rejilla en blanco, como si nunca
// hubiera contestado.
test('una disponibilidad guardada con la rejilla vieja se sigue viendo', () => {
  assert.equal(franjaPorHoraInicio('06:00'), 'manana');
  assert.equal(franjaPorHoraInicio('14:00'), 'tarde');
  assert.equal(franjaPorHoraInicio('20:00:00'), 'noche');
});

test('celdaKey y parseCeldaKey son inversas para todas las franjas', () => {
  for (const f of FRANJAS) {
    assert.deepEqual(parseCeldaKey(celdaKey(3, f.key)), { dow: 3, franja: f.key });
  }
});
