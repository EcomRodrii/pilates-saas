import { test } from 'node:test';
import assert from 'node:assert/strict';
import { huecosDelMenu, olvidarAltoBarra, BARRA_ALTO_INICIAL, BARRA_SEPARACION } from './panel-huecos.ts';

const ANCHO = '256px';
const banda = (alto: number) => `${alto + BARRA_SEPARACION}px`;

test('en columna no hay nada fijo arriba: sticky a 0, y el ancho es el de la barra', () => {
  olvidarAltoBarra();
  const h = huecosDelMenu(false, ANCHO);
  assert.equal(h.sidebarW, ANCHO);
  assert.equal(h.panelStickyTop, '0px');
  // `--panel-top` es el AIRE del contenido, no un obstáculo: no es 0.
  assert.equal(h.panelTop, '0.5rem');
});

test('tumbado, el hueco de arriba y el tope del sticky son el mismo: donde acaba la barra', () => {
  olvidarAltoBarra();
  const h = huecosDelMenu(true, ANCHO, 155);
  assert.equal(h.sidebarW, '0px');
  assert.equal(h.panelTop, banda(155));
  assert.equal(h.panelStickyTop, banda(155));
});

// ─────────────────────────────────────────────────────────────────────────────
// El fallo que motivó separar esto: OMITIR la medida no es «una fila».
//
// De los cuatro sitios que piden los huecos, solo el `ResizeObserver` trae
// medida. Los otros tres la omiten. Mientras omitirla significó «68 px», una
// sola de esas tres llamadas —corriendo con la barra ya crecida— dejaba el
// buscador clavado DENTRO del menú, y el `ResizeObserver` no lo arreglaba
// porque solo vuelve a disparar si la barra CAMBIA de tamaño.
// ─────────────────────────────────────────────────────────────────────────────

test('una llamada SIN medida no puede encoger un hueco ya medido', () => {
  olvidarAltoBarra();
  huecosDelMenu(true, ANCHO, 210);           // el ResizeObserver mide 3 filas
  const despues = huecosDelMenu(true, ANCHO); // cualquiera de los otros tres
  assert.equal(
    despues.panelStickyTop, banda(210),
    'la llamada sin medida ha vuelto a suponer una fila: el buscador se mete en el menú',
  );
});

test('y tampoco al ir y volver de columna a barra', () => {
  olvidarAltoBarra();
  huecosDelMenu(true, ANCHO, 194);
  huecosDelMenu(false, ANCHO);                // se pasa a menú lateral
  const vuelta = huecosDelMenu(true, ANCHO);  // y se vuelve a barra, sin medir aún
  assert.equal(vuelta.panelStickyTop, banda(194));
});

test('una medida nueva SÍ manda, hacia arriba y hacia abajo', () => {
  olvidarAltoBarra();
  huecosDelMenu(true, ANCHO, 210);
  assert.equal(huecosDelMenu(true, ANCHO, 115).panelStickyTop, banda(115), 'la barra encogió a una fila');
  assert.equal(huecosDelMenu(true, ANCHO, 250).panelStickyTop, banda(250), 'y volvió a crecer');
});

test('un 0 no es una medida: es una barra que aún no se ha pintado', () => {
  olvidarAltoBarra();
  huecosDelMenu(true, ANCHO, 194);
  assert.equal(huecosDelMenu(true, ANCHO, 0).panelStickyTop, banda(194));
});

test('sin haber medido nunca se usa el alto de partida, que es lo que ocupa una fila', () => {
  olvidarAltoBarra();
  assert.equal(huecosDelMenu(true, ANCHO).panelStickyTop, banda(BARRA_ALTO_INICIAL));
});

test('el alto se redondea: media décima de píxel no puede colarse en una variable CSS', () => {
  olvidarAltoBarra();
  assert.equal(huecosDelMenu(true, ANCHO, 154.6).panelStickyTop, '171px');
});
