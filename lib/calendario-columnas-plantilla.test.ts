import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plantillaColumnasSemana, ANCHO_MIN_CARRIL_PX, ANCHO_MIN_CARRIL_GRANDE_PX, PESO_MAX_DIA } from './calendario-columnas.ts';

// Un día con `n` carriles. Solo importa `totalCarriles`: el resto de la sesión
// no interviene en el reparto.
const dia = (...carriles: number[]) => ({ sesiones: carriles.map((totalCarriles) => ({ totalCarriles })) }) as never;
const MIN = 92;

test('sin solapes, las siete columnas se reparten igual (como antes)', () => {
  const r = plantillaColumnasSemana(Array.from({ length: 7 }, () => dia(1)), MIN);
  assert.equal(r.plantilla, Array(7).fill(`minmax(${MIN}px, 1fr)`).join(' '));
  assert.equal(r.anchoMin, 7 * MIN);
});

test('un día vacío o cerrado pesa lo mismo que uno con una clase', () => {
  const r = plantillaColumnasSemana([dia(), dia(1)], MIN);
  assert.equal(r.plantilla, `minmax(${MIN}px, 1fr) minmax(${MIN}px, 1fr)`);
});

test('el día con tres clases a la vez pesa el triple y no deja un carril por debajo del mínimo', () => {
  const r = plantillaColumnasSemana([dia(3, 3, 3, 1), dia(1)], MIN);
  assert.equal(r.plantilla, `minmax(${3 * ANCHO_MIN_CARRIL_PX}px, 3fr) minmax(${MIN}px, 1fr)`);
});

test('con dos carriles el mínimo sube solo si la columna base no los cabe', () => {
  // 2 x 64 = 128 > 92: sube. Si el mínimo base ya los cabe, manda el base.
  assert.match(plantillaColumnasSemana([dia(2, 2)], MIN).plantilla, /^minmax\(128px, 2fr\)$/);
  assert.match(plantillaColumnasSemana([dia(2, 2)], 200).plantilla, /^minmax\(200px, 2fr\)$/);
});

test('un día con muchas salas a la vez no se come la semana: el peso tiene tope', () => {
  const r = plantillaColumnasSemana([dia(6, 6, 6, 6, 6, 6)], MIN);
  assert.equal(r.plantilla, `minmax(${PESO_MAX_DIA * ANCHO_MIN_CARRIL_PX}px, ${PESO_MAX_DIA}fr)`);
});

test('el ancho mínimo total es la suma de los mínimos, para el scroll horizontal', () => {
  const r = plantillaColumnasSemana([dia(3, 3, 3), dia(1), dia()], MIN);
  assert.equal(r.anchoMin, 3 * ANCHO_MIN_CARRIL_PX + MIN + MIN);
});

test('sin columnas devuelve una pista válida, no una plantilla vacía', () => {
  assert.equal(plantillaColumnasSemana([], MIN).plantilla, `minmax(${MIN}px, 1fr)`);
});

test('con letra grande el carril mínimo es el que se le pase', () => {
  const r = plantillaColumnasSemana([dia(3, 3, 3), dia(1)], MIN, ANCHO_MIN_CARRIL_GRANDE_PX);
  assert.equal(r.plantilla, `minmax(${3 * ANCHO_MIN_CARRIL_GRANDE_PX}px, 3fr) minmax(${MIN}px, 1fr)`);
  assert.equal(r.anchoMin, 3 * ANCHO_MIN_CARRIL_GRANDE_PX + MIN);
  assert.ok(ANCHO_MIN_CARRIL_GRANDE_PX > ANCHO_MIN_CARRIL_PX);
});
