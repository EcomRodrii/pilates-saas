import test from 'node:test';
import assert from 'node:assert/strict';
import { ESTADO_INICIAL, TOPE_COMPLETA, UMBRAL_BAJAR, UMBRAL_SUBIR, siguienteEstado, type EstadoIsla } from './isla-scroll.ts';

const EN_300: EstadoIsla = { compacta: false, y: 300, acumulado: 0 };
const recorrer = (inicio: EstadoIsla, posiciones: number[]) => posiciones.reduce(siguienteEstado, inicio);

test('cerca del tope la isla está siempre completa', () => {
  const e = recorrer(ESTADO_INICIAL, [10, 40, TOPE_COMPLETA]);
  assert.equal(e.compacta, false);
});

test('al bajar lo bastante seguido se encoge', () => {
  const e = recorrer({ ...ESTADO_INICIAL, y: 100 }, [100 + UMBRAL_BAJAR + 1]);
  assert.equal(e.compacta, true);
});

test('un temblor corto al bajar no la encoge', () => {
  const e = recorrer(EN_300, [310, 320]);
  assert.equal(e.compacta, false);
});

test('al subir un poco se alarga, antes de lo que tardó en encogerse', () => {
  let e = recorrer(EN_300, [300 + UMBRAL_BAJAR + 5]);
  assert.equal(e.compacta, true);
  assert.ok(UMBRAL_SUBIR < UMBRAL_BAJAR);
  e = recorrer(e, [e.y - UMBRAL_SUBIR - 1]);
  assert.equal(e.compacta, false);
});

test('el cambio de sentido descarta el recorrido anterior (histéresis)', () => {
  // Baja casi hasta el umbral, sube un poco y vuelve a bajar: no debe sumar.
  const e = recorrer(EN_300, [300 + UMBRAL_BAJAR - 2, 300 + UMBRAL_BAJAR - 6, 300 + UMBRAL_BAJAR - 2]);
  assert.equal(e.compacta, false);
});

test('el rebote negativo de iOS cuenta como el tope', () => {
  const e = recorrer({ compacta: true, y: 500, acumulado: 40 }, [-30]);
  assert.equal(e.compacta, false);
});

test('al llegar arriba del todo se alarga aunque se suba de golpe', () => {
  const e = recorrer({ compacta: true, y: 1200, acumulado: 60 }, [0]);
  assert.equal(e.compacta, false);
});
