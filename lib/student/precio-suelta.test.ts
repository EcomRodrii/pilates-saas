import { test } from 'node:test';
import assert from 'node:assert/strict';
import { precioClaseSuelta, precioDeSesion } from './precio-suelta.ts';

// Los casos A–D que pide el informe, más los que rompen de verdad.
const PLANES = [
  { tipo: 'MENSUAL', precio: 85, activo: true, sesiones: null },
  { tipo: 'BONO', precio: 64, activo: true, sesiones: 8 },
  { tipo: 'BONO', precio: 36, activo: true, sesiones: 4 },
  { tipo: 'PUNTUAL', precio: 12, activo: true, sesiones: 1 },
];

test('Caso B/C/D · el precio sale del plan PUNTUAL del estudio, no de un 0', () => {
  assert.equal(precioClaseSuelta(PLANES), 12);
  assert.equal(precioClaseSuelta([{ tipo: 'PUNTUAL', precio: 1, activo: true }]), 1);
  assert.equal(precioClaseSuelta([{ tipo: 'PUNTUAL', precio: 10, activo: true }]), 10);
});

test('no confunde un BONO con una clase suelta aunque sea de 1 sesión', () => {
  // Un bono de una sesión existe y NO es el precio de clase suelta.
  assert.equal(precioClaseSuelta([{ tipo: 'BONO', precio: 20, activo: true, sesiones: 1 }]), null);
});

test('Caso 5 · un plan DESACTIVADO no fija precio — el checkout lo rechazaría', () => {
  assert.equal(precioClaseSuelta([{ tipo: 'PUNTUAL', precio: 12, activo: false }]), null);
});

test('sin plan PUNTUAL devuelve null, que NO es cero', () => {
  // `null` significa «este estudio no vende clases sueltas». Pintarlo como
  // «0 €» es justo el bug que se está arreglando.
  const soloBonos = PLANES.filter((p) => p.tipo !== 'PUNTUAL');
  assert.equal(precioClaseSuelta(soloBonos), null);
});

test('lista vacía o ausente devuelve null, no revienta', () => {
  assert.equal(precioClaseSuelta([]), null);
  assert.equal(precioClaseSuelta(null), null);
  assert.equal(precioClaseSuelta(undefined), null);
});

test('un precio de 0 o negativo no cuenta como precio', () => {
  assert.equal(precioClaseSuelta([{ tipo: 'PUNTUAL', precio: 0, activo: true }]), null);
  assert.equal(precioClaseSuelta([{ tipo: 'PUNTUAL', precio: -5, activo: true }]), null);
});

test('con varios PUNTUAL activos se toma el más barato', () => {
  const v = precioClaseSuelta([
    { tipo: 'PUNTUAL', precio: 18, activo: true },
    { tipo: 'PUNTUAL', precio: 12, activo: true },
  ]);
  assert.equal(v, 12);
});

test('el override de la sesión manda sobre la tarifa del estudio', () => {
  assert.equal(precioDeSesion(25, PLANES), 25);
});

test('un override de 0 es un 0 DELIBERADO y se respeta', () => {
  // Una clase de puertas abiertas, gratis a propósito. Distinto de «no hay dato».
  assert.equal(precioDeSesion(0, PLANES), 0);
});

test('sin override se cae a la tarifa del estudio — el bug original', () => {
  // Antes: `precioPuntual ?? 0` → 0 €. Ahora: 12 €.
  assert.equal(precioDeSesion(null, PLANES), 12);
  assert.equal(precioDeSesion(undefined, PLANES), 12);
});

test('sin override y sin plan PUNTUAL: null, para que la pantalla no invente', () => {
  assert.equal(precioDeSesion(null, PLANES.filter((p) => p.tipo !== 'PUNTUAL')), null);
});

test('⚠️ una «clase de prueba» más barata NO es el precio de la clase suelta', () => {
  assert.equal(precioClaseSuelta([
    { tipo: 'PUNTUAL', precio: 22, activo: true },
    { tipo: 'PUNTUAL', precio: 10, activo: true, esPrueba: true },
  ]), 22);
  // Con solo la prueba, este estudio no vende clases sueltas: null, no 10.
  assert.equal(precioClaseSuelta([{ tipo: 'PUNTUAL', precio: 10, activo: true, esPrueba: true }]), null);
});

test('con la clase delante, el precio es el que cobra el mostrador: el plan que sirve para ese tipo', () => {
  const planes = [
    { tipo: 'PUNTUAL', precio: 18, activo: true, sesiones: 1, tiposClaseIds: ['reformer'] },
    { tipo: 'PUNTUAL', precio: 12, activo: true, sesiones: 1, tiposClaseIds: [] },
  ];
  // Escaparate sin clase: el mínimo (comportamiento de siempre).
  assert.equal(precioClaseSuelta(planes), 12);
  // Reformer: sirven las dos y el mostrador elige la más barata, 12 (no 18).
  assert.equal(precioClaseSuelta(planes, 'reformer'), 12);
  // Mat: solo sirve la general.
  assert.equal(precioClaseSuelta(planes, 'mat'), 12);
});

test('con la clase delante, una suelta acotada a otro tipo no es el precio de esta clase', () => {
  const soloReformer = [{ tipo: 'PUNTUAL', precio: 18, activo: true, sesiones: 1, tiposClaseIds: ['reformer'] }];
  assert.equal(precioClaseSuelta(soloReformer, 'reformer'), 18);
  // Sin suelta que sirva para Mat, no se vende clase suelta de Mat: null, no 18.
  assert.equal(precioClaseSuelta(soloReformer, 'mat'), null);
  // Sin tipo conocido no se puede descartar (misma semántica que planCubreTipoClase).
  assert.equal(precioClaseSuelta(soloReformer, null), 18);
});

test('con la clase delante, una suelta que no es de UNA sesión no se enseña (el mostrador no la vende)', () => {
  assert.equal(precioClaseSuelta([{ tipo: 'PUNTUAL', precio: 30, activo: true, sesiones: 3 }], 'mat'), null);
  assert.equal(precioClaseSuelta([{ tipo: 'PUNTUAL', precio: 30, activo: true }], 'mat'), null);
});

test('precioDeSesion: el override de la sesión sigue mandando y el tipo solo cuenta sin él', () => {
  const planes = [{ tipo: 'PUNTUAL', precio: 18, activo: true, sesiones: 1, tiposClaseIds: ['reformer'] }];
  assert.equal(precioDeSesion(25, planes, 'mat'), 25);
  assert.equal(precioDeSesion(null, planes, 'mat'), null);
  assert.equal(precioDeSesion(null, planes, 'reformer'), 18);
});
