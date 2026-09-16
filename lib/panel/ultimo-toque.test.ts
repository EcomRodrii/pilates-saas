import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _fijarToque, origenDesdeToque, toqueReciente, VIGENCIA_TOQUE_MS } from './ultimo-toque.ts';

test('crece desde el punto tocado, esté donde esté la caja', () => {
  // Diálogo de 400×300 centrado en 1440×900: centro (720, 450), esquina (520, 300).
  assert.equal(origenDesdeToque({ x: 1300, y: 60 }, { x: 720, y: 450 }, { ancho: 400, alto: 300 }), '780px -240px');
  // Tocar en su propio centro da el centro de la caja.
  assert.equal(origenDesdeToque({ x: 720, y: 450 }, { x: 720, y: 450 }, { ancho: 400, alto: 300 }), '200px 150px');
  // Una hoja pegada abajo (centro en y=750): el origen se mide desde SU esquina.
  assert.equal(origenDesdeToque({ x: 100, y: 880 }, { x: 720, y: 750 }, { ancho: 1440, alto: 300 }), '100px 280px');
});

test('un toque viejo no vale: se abrió por otro camino', () => {
  _fijarToque({ x: 10, y: 10, en: 1_000 });
  assert.deepEqual(toqueReciente(1_000 + VIGENCIA_TOQUE_MS), { x: 10, y: 10, en: 1_000 });
  assert.equal(toqueReciente(1_000 + VIGENCIA_TOQUE_MS + 1), null);
  _fijarToque(null);
  assert.equal(toqueReciente(), null);
});
