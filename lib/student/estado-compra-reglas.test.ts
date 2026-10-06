import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esperaAntesDe, leerEstadoCompra, resumenDeCompra } from './estado-compra-reglas.ts';
import { RETARDOS_POLL_MS } from '../billing/estado-pago-publico.ts';

const compra = { entregada: true, plan: 'Bono 8 sesiones', sesionesRestantes: 8, fechaFin: '2026-12-31' };

test('solo `compra.entregada` del servidor es «entregada»', () => {
  assert.deepEqual(leerEstadoCompra(200, null, { estado: 'en_proceso', compra }), { tipo: 'entregada', compra });
  assert.deepEqual(leerEstadoCompra(200, null, { estado: 'en_proceso' }), { tipo: 'en_proceso' });
  // Un `compra` a medias no se da por bueno.
  assert.deepEqual(leerEstadoCompra(200, null, { compra: { entregada: false, plan: 'x' } }), { tipo: 'en_proceso' });
  assert.deepEqual(leerEstadoCompra(200, null, { compra: { entregada: true } }), { tipo: 'en_proceso' });
  assert.deepEqual(leerEstadoCompra(200, null, null), { tipo: 'en_proceso' });
});

test('un 500 o un cuerpo raro no son un error del pago: «en proceso»', () => {
  assert.deepEqual(leerEstadoCompra(500, null, { compra }), { tipo: 'en_proceso' });
  assert.deepEqual(leerEstadoCompra(503, null, 'html'), { tipo: 'en_proceso' });
});

test('429: en proceso, respetando el Retry-After (acotado a 60 s)', () => {
  assert.deepEqual(leerEstadoCompra(429, '3', {}), { tipo: 'en_proceso', esperaMinMs: 3000 });
  assert.deepEqual(leerEstadoCompra(429, '999', {}), { tipo: 'en_proceso', esperaMinMs: 60_000 });
  assert.deepEqual(leerEstadoCompra(429, null, {}), { tipo: 'en_proceso' });
  assert.deepEqual(leerEstadoCompra(429, 'mañana', {}), { tipo: 'en_proceso' });
});

test('401: sesión caducada, o el segundo paso si lo dice el servidor', () => {
  assert.deepEqual(leerEstadoCompra(401, null, { error: 'x' }), { tipo: 'sesion' });
  assert.deepEqual(leerEstadoCompra(401, null, { codigo: 'doble_factor_requerido' }), { tipo: 'dos-pasos' });
});

test('la espera sigue la cadencia de siempre y se acaba', () => {
  RETARDOS_POLL_MS.forEach((ms, i) => assert.equal(esperaAntesDe(i), ms));
  assert.equal(esperaAntesDe(RETARDOS_POLL_MS.length), null);
  assert.equal(esperaAntesDe(-1), null);
});

test('un Retry-After alarga la espera, nunca la acorta', () => {
  assert.equal(esperaAntesDe(0, 5000), 5000);
  assert.equal(esperaAntesDe(4, 1000), RETARDOS_POLL_MS[4]);
});

test('el resumen dice qué tiene, sin inventar sesiones a una cuota', () => {
  assert.equal(resumenDeCompra(compra), 'Bono 8 sesiones activo · te quedan 8 clases');
  assert.equal(resumenDeCompra({ ...compra, sesionesRestantes: 1 }), 'Bono 8 sesiones activo · te queda 1 clase');
  assert.equal(resumenDeCompra({ ...compra, plan: 'Mensual', sesionesRestantes: null, fechaFin: null }), 'Mensual activo · clases ilimitadas');
  assert.equal(resumenDeCompra(compra, () => '31 dic'), 'Bono 8 sesiones activo · te quedan 8 clases hasta el 31 dic');
});
