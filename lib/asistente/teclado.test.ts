import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaConTeclado, UMBRAL_TECLADO_PX } from './teclado.ts';

test('sin teclado (o solo la barra de Safari escondiéndose), el chat va donde siempre', () => {
  assert.equal(areaConTeclado(null), null);
  assert.equal(areaConTeclado({ alto: 664, altoVisible: 664, desplazamiento: 0 }), null);
  assert.equal(areaConTeclado({ alto: 664, altoVisible: 664 - UMBRAL_TECLADO_PX + 1, desplazamiento: 0 }), null);
  assert.equal(areaConTeclado({ alto: 0, altoVisible: 0, desplazamiento: 0 }), null);
});

test('con el teclado abierto, el chat ocupa justo lo visible, también si Safari ha corrido la página', () => {
  assert.deepEqual(areaConTeclado({ alto: 664, altoVisible: 328.4, desplazamiento: 0 }), { top: 0, height: 328 });
  assert.deepEqual(areaConTeclado({ alto: 664, altoVisible: 328, desplazamiento: 211.6 }), { top: 212, height: 328 });
  // Un desplazamiento negativo (el rebote de iOS) no saca el chat por arriba.
  assert.deepEqual(areaConTeclado({ alto: 664, altoVisible: 328, desplazamiento: -12 }), { top: 0, height: 328 });
});
