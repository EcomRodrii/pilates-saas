import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FRANJAS } from './franjas.ts';

// La rejilla de disponibilidad tiene que tener TANTAS columnas como franjas.
//
// Estaba escrito a mano —`grid-cols-[auto_repeat(3,1fr)]`— y las franjas pasaron
// a ser cuatro al añadir «Última hora». Cada fila mete etiqueta + una celda por
// franja, así que con cinco celdas en cuatro columnas todo se desplazaba una
// posición: los días salían en diagonal y la cabecera de la última franja caía
// dentro del cuerpo de la tabla. En un móvil quedaba ilegible.
//
// El fallo no fue poner un 3: fue que hubiera un número que MANTENER. Este test
// vigila que las dos pantallas sigan derivándolo de `FRANJAS`, no que valga 4 —
// si mañana hay cinco franjas, esto tiene que seguir en verde sin tocarlo.

const PANTALLAS = [
  'app/disponibilidad/[token]/disponibilidad-form.tsx',
  'components/mi-perfil/tab-mi-disponibilidad.tsx',
];

test('las franjas son cuatro (si esto cambia, es el dato, no la rejilla)', () => {
  assert.equal(FRANJAS.length, 4);
  assert.deepEqual(FRANJAS.map((f) => f.key), ['manana', 'media_manana', 'tarde', 'noche']);
});

for (const ruta of PANTALLAS) {
  test(`${ruta}: la rejilla deriva sus columnas de FRANJAS`, () => {
    const fuente = readFileSync(new URL(`../../${ruta}`, import.meta.url), 'utf8');
    assert.ok(
      fuente.includes('repeat(${FRANJAS.length}'),
      'la rejilla debe construir sus columnas con FRANJAS.length',
    );
  });

  test(`${ruta}: no queda ningún número de columnas escrito a mano`, () => {
    const fuente = readFileSync(new URL(`../../${ruta}`, import.meta.url), 'utf8');
    const aMano = fuente.match(/grid-cols-\[auto_repeat\(\d+/);
    assert.equal(aMano, null, `columnas fijas encontradas: ${aMano?.[0]}`);
  });
}
