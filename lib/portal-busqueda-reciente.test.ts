import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claveBusquedaReciente, obtenerBusquedasRecientes, guardarBusquedaReciente } from './portal-busqueda-reciente.ts';

// Este módulo corre en Node (sin DOM) para el camino "sin window" — el
// camino con localStorage real (dedupe, orden, tope) se cubre en el E2E de
// portal (navegador), mismo criterio que lib/portal-bienvenida.test.ts.

test('claveBusquedaReciente: una clave por estudio (slug), no global', () => {
  assert.equal(claveBusquedaReciente('tentare'), 'pilates:portal-busqueda-reciente:tentare');
  assert.notEqual(claveBusquedaReciente('otro-estudio'), claveBusquedaReciente('tentare'));
});

test('obtenerBusquedasRecientes: sin `window` (SSR/Node) → [], nunca ejemplos de relleno', () => {
  assert.deepEqual(obtenerBusquedasRecientes('tentare'), []);
});

test('guardarBusquedaReciente: sin `window` no lanza', () => {
  assert.doesNotThrow(() => guardarBusquedaReciente('tentare', 'reformer'));
});

test('guardarBusquedaReciente: query vacía no escribe nada (no lanza tampoco)', () => {
  assert.doesNotThrow(() => guardarBusquedaReciente('tentare', '   '));
});
