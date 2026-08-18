import test from 'node:test';
import assert from 'node:assert/strict';
import { valoracionParaPantalla, MINIMO_VALORACIONES } from './valoracion.ts';

// ⚠️ El caso que motivó la regla: en producción hay DOS valoraciones en toda la
// base de datos, las dos de 5. Un «5,0 ★» ahí dice que esa instructora es
// perfecta cuando lo que pasa es que la han puntuado dos veces.
test('con menos del mínimo no se enseña NADA', () => {
  assert.equal(valoracionParaPantalla({ media: 5, total: 2 }), null);
  assert.equal(valoracionParaPantalla({ media: 4.8, total: MINIMO_VALORACIONES - 1 }), null);
});

test('sin valoraciones tampoco se inventa un hueco', () => {
  assert.equal(valoracionParaPantalla(null), null);
  assert.equal(valoracionParaPantalla(undefined), null);
  assert.equal(valoracionParaPantalla({ media: 0, total: 0 }), null);
});

test('a partir del mínimo se enseña, y SIEMPRE con su respaldo', () => {
  const v = valoracionParaPantalla({ media: 4.625, total: 12 });
  assert.equal(v?.nota, '4,6');
  // ⚠️ La nota nunca va sola: sin el número de valoraciones detrás vuelve a ser
  // un número sin dato, que es justo lo que se está evitando.
  assert.equal(v?.respaldo, '12 valoraciones');
});

test('un decimal, no dos', () => {
  // «4,63» finge una precisión que 12 opiniones no tienen.
  assert.equal(valoracionParaPantalla({ media: 4.63, total: 12 })?.nota, '4,6');
  assert.equal(valoracionParaPantalla({ media: 5, total: 30 })?.nota, '5,0');
});

test('coma decimal, que es como se escribe en español', () => {
  assert.ok(!valoracionParaPantalla({ media: 4.5, total: 9 })?.nota.includes('.'));
});

test('el mínimo se puede subir, pero no bajar por descuido', () => {
  // El parámetro existe para poder endurecerlo por pantalla si hace falta.
  assert.equal(valoracionParaPantalla({ media: 5, total: 6 }, 10), null);
  assert.ok(valoracionParaPantalla({ media: 5, total: 12 }, 10));
});
