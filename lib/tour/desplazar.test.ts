import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modoDeDesplazamiento } from './desplazar.ts';

const caja = (top: number, alto: number) => ({ top, bottom: top + alto, height: alto });

test('una fila o un botón ya a la vista no mueve la página', () => {
  assert.equal(modoDeDesplazamiento(caja(300, 60), 800), 'ninguno');
});

test('una fila fuera de la vista se centra', () => {
  assert.equal(modoDeDesplazamiento(caja(1200, 60), 800), 'centro');
  assert.equal(modoDeDesplazamiento(caja(-200, 60), 800), 'centro');
  assert.equal(modoDeDesplazamiento(caja(780, 60), 800), 'centro', 'medio cortada por abajo');
});

test('una pantalla entera (alta) NUNCA se centra: saltaría a la mitad del contenido', () => {
  assert.equal(modoDeDesplazamiento(caja(0, 3000), 800), 'ninguno', 'su principio ya se ve');
  assert.equal(modoDeDesplazamiento(caja(-1200, 3000), 800), 'inicio');
  assert.equal(modoDeDesplazamiento(caja(1500, 3000), 800), 'inicio');
  for (const t of [-5000, -1200, 0, 300, 700, 1500]) {
    assert.notEqual(modoDeDesplazamiento(caja(t, 3000), 800), 'centro', `top=${t}`);
  }
});

test('un elemento alto cuyo principio está abajo del todo se lleva a su inicio', () => {
  assert.equal(modoDeDesplazamiento(caja(600, 2000), 800), 'inicio');
});
