import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarValoraciones, textoValoraciones } from './valoraciones-instructora.ts';

test('la nota va con un decimal, su número de valoraciones y hasta cuándo son los datos', () => {
  assert.deepEqual(textoValoraciones({ media: 4.63, total: 38, hasta: '2026-08-31' }), {
    nota: '4,6 · 38 valoraciones',
    hasta: 'Datos hasta el 31 de agosto',
  });
  assert.equal(textoValoraciones({ media: 5, total: 1, hasta: '2026-07-31' })?.nota, '5,0 · 1 valoración');
});

test('sin agregado no hay nota que enseñar', () => {
  assert.equal(textoValoraciones(null), null);
});

test('la respuesta del servidor solo vale con la forma exacta', () => {
  assert.deepEqual(normalizarValoraciones({ media: 4.2, total: 12, hasta: '2026-08-31' }), { media: 4.2, total: 12, hasta: '2026-08-31' });
  for (const malo of [null, {}, { media: '4', total: 12, hasta: '2026-08-31' }, { media: 6, total: 12, hasta: '2026-08-31' },
    { media: 4, total: 0, hasta: '2026-08-31' }, { media: 4, total: 2.5, hasta: '2026-08-31' }, { media: 4, total: 12, hasta: 'ayer' }]) {
    assert.equal(normalizarValoraciones(malo), null, JSON.stringify(malo));
  }
});
