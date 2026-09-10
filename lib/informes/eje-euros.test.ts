import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etiquetaEuros, techoDelEje, marcasDelEje } from './eje-euros.ts';

const N = 4; // las marcas que dibuja /informes

function etiquetasCon(valores: number[]): string[] {
  return marcasDelEje(techoDelEje(valores, N), N).map(etiquetaEuros);
}

test('un periodo sin cobros no rotula tres marcas distintas con el mismo número', () => {
  // El caso que se vio: con el suelo en 1 € el eje decía
  // «0 €, 0 €, 1 €, 1 €, 1 €» de abajo arriba.
  const etiquetas = etiquetasCon([0, 0, 0, 0, 0]);
  assert.equal(new Set(etiquetas).size, etiquetas.length, `etiquetas repetidas: ${etiquetas.join(' · ')}`);
  assert.deepEqual(etiquetas, ['0 €', '1 €', '2 €', '3 €', '4 €']);
});

test('ninguna cantidad pequeña repite etiqueta', () => {
  // Debajo de 4 € el paso era menor que un euro y las etiquetas colisionaban.
  for (let max = 0; max <= 200; max++) {
    const etiquetas = etiquetasCon([max]);
    assert.equal(new Set(etiquetas).size, etiquetas.length, `max=${max} → ${etiquetas.join(' · ')}`);
  }
});

test('el techo no recorta el valor más alto', () => {
  assert.equal(techoDelEje([12, 340, 7], N), 340);
});

test('los miles se escriben en español, no con punto decimal', () => {
  // «1.5k €» se lee en español como mil quinientos MIL.
  assert.equal(etiquetaEuros(1500), '1,5k €');
  assert.equal(etiquetaEuros(2000), '2k €');
  assert.equal(etiquetaEuros(999), '999 €');
});
