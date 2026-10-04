import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tintaBarraDeEstado } from './barra-de-estado.ts';

test('tintaBarraDeEstado: letras oscuras sobre crema, que es lo de siempre', () => {
  assert.equal(tintaBarraDeEstado({ fondoOscuro: false }), 'oscura');
  assert.equal(tintaBarraDeEstado({ fondoOscuro: false, sobreFoto: false }), 'oscura');
});

test('tintaBarraDeEstado: letras claras sobre la foto de portada o con «Carbón»', () => {
  assert.equal(tintaBarraDeEstado({ fondoOscuro: false, sobreFoto: true }), 'clara');
  assert.equal(tintaBarraDeEstado({ fondoOscuro: true }), 'clara');
  assert.equal(tintaBarraDeEstado({ fondoOscuro: true, sobreFoto: true }), 'clara');
});
