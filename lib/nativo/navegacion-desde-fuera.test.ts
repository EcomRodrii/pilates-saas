import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marcarNavegacionDesdeFuera, navegoDesdeFueraHaceNada, VENTANA_MS } from './navegacion-desde-fuera.ts';

test('sin aviso ni enlace, /app navega como siempre', () => {
  assert.equal(navegoDesdeFueraHaceNada(1_000), false);
});

test('justo tras un aviso pulsado, /app no pisa su destino; pasado el rato, vuelve a navegar', () => {
  marcarNavegacionDesdeFuera(10_000);
  assert.equal(navegoDesdeFueraHaceNada(10_500), true);
  assert.equal(navegoDesdeFueraHaceNada(10_000 + VENTANA_MS - 1), true);
  assert.equal(navegoDesdeFueraHaceNada(10_000 + VENTANA_MS), false);
});
