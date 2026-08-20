import test from 'node:test';
import assert from 'node:assert/strict';
import { recorridoDe, textoPaso } from './pasos-flujo.ts';

test('el camino de invitada que paga son dos pasos, en orden', () => {
  assert.deepEqual(recorridoDe('datos'), { etiquetas: ['Tus datos', 'Pago'], actual: 0 });
  assert.deepEqual(recorridoDe('pago'), { etiquetas: ['Tus datos', 'Pago'], actual: 1 });
  assert.equal(textoPaso(recorridoDe('datos')!), 'Paso 1 de 2');
  assert.equal(textoPaso(recorridoDe('pago')!), 'Paso 2 de 2');
});

test('el alta con contrato son tres, y se conocen al llegar a la primera', () => {
  assert.equal(recorridoDe('registro')!.etiquetas.length, 3);
  assert.equal(recorridoDe('registro')!.actual, 0);
  assert.equal(recorridoDe('contrato')!.actual, 1);
  assert.equal(textoPaso(recorridoDe('contrato')!), 'Paso 2 de 3');
});

test('⚠️ lo que NO se sabe no se numera', () => {
  // `login` tiene dos continuaciones posibles según lo que responda el
  // servidor, y `confirm` se alcanza por dos caminos distintos. Numerarlos
  // obligaría a inventar un total que se contradiría a mitad de flujo.
  assert.equal(recorridoDe('login'), null);
  assert.equal(recorridoDe('confirm'), null);
});

test('los pasos terminales no llevan indicador', () => {
  for (const paso of ['done', 'espera', 'pendiente'] as const) {
    assert.equal(recorridoDe(paso), null);
  }
});
