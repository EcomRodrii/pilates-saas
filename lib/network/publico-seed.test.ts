import test from 'node:test';
import assert from 'node:assert/strict';

import { perfilCoincideFiltro, PERFILES_SEED_E2E } from './publico.ts';
import type { FiltroBusquedaNetwork } from './tipos.ts';

// ⚠️ Existe porque `perfilCoincideFiltro` reimplementa a mano lo que en
// producción hace Postgres (`.eq`/`.overlaps`/`.in`/`.gte`) para que la
// semilla E2E (ver `publico.ts`) también respete los filtros de la URL — sin
// esto el filtro de especialidad cambiaba la URL y no filtraba nada, y lo
// cazó el propio e2e antes de llegar a CI.

const SIN_FILTROS: FiltroBusquedaNetwork = {
  ciudad: null, especialidades: [], disponibilidad: [], horarios: [],
  tipoTrabajo: [], experienciaMinima: null, tarifaRango: [],
};

const [marta, sofia] = PERFILES_SEED_E2E;

test('sin filtros, coinciden los dos', () => {
  assert.equal(perfilCoincideFiltro(marta, SIN_FILTROS), true);
  assert.equal(perfilCoincideFiltro(sofia, SIN_FILTROS), true);
});

test('especialidades: overlap, no igualdad exacta', () => {
  // Marta tiene reformer+mat: pedir solo reformer la incluye igual.
  const f: FiltroBusquedaNetwork = { ...SIN_FILTROS, especialidades: ['reformer'] };
  assert.equal(perfilCoincideFiltro(marta, f), true);
  assert.equal(perfilCoincideFiltro(sofia, f), false);
});

test('tarifaRango: un perfil sin tarifa ("a consultar") no entra en NINGÚN rango pedido', () => {
  // Sofía tiene tarifaRango: null. Mismo comportamiento que `.in()` de
  // Postgres sobre una columna NULL: nunca es verdadero, aunque se pidieran
  // TODOS los rangos existentes.
  const f: FiltroBusquedaNetwork = { ...SIN_FILTROS, tarifaRango: ['20-25', '25-30', '30-35', 'a_negociar'] };
  assert.equal(perfilCoincideFiltro(sofia, f), false);
});

test('experienciaMinima: null no cumple un mínimo pedido', () => {
  const conMinimo = { ...SIN_FILTROS, experienciaMinima: 1 };
  // Ninguno de los dos perfiles de la semilla tiene aniosExperiencia null,
  // así que se prueba también el caso explícito con un perfil sintético.
  const sinExperiencia = { ...marta, aniosExperiencia: null };
  assert.equal(perfilCoincideFiltro(sinExperiencia, conMinimo), false);
  assert.equal(perfilCoincideFiltro(marta, conMinimo), true);
});

test('ciudad: substring sin distinguir mayúsculas, como el ilike de Postgres', () => {
  assert.equal(perfilCoincideFiltro(marta, { ...SIN_FILTROS, ciudad: 'madr' }), true);
  assert.equal(perfilCoincideFiltro(marta, { ...SIN_FILTROS, ciudad: 'MADRID' }), true);
  assert.equal(perfilCoincideFiltro(marta, { ...SIN_FILTROS, ciudad: 'Barcelona' }), false);
});
