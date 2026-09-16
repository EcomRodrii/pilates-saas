import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANCHO_VENTANA, ESTADO_INICIAL, MARGEN_VENTANA, acotarPosicion, leerEstado, posicionInicial,
} from './ventana-flotante.ts';

const PORTATIL = { ancho: 1366, alto: 768 };
const VENTANA = { ancho: ANCHO_VENTANA, alto: 420 };

test('lo guardado que no tiene forma de estado vuelve al inicial, sin romper', () => {
  for (const raw of [null, '', 'no es json', '42', 'null', '[]']) {
    assert.deepEqual(leerEstado(raw), ESTADO_INICIAL, `raw=${String(raw)}`);
  }
});

test('una posición a medias no se usa: se vuelve a colocar arriba a la derecha', () => {
  assert.equal(leerEstado(JSON.stringify({ abierta: true, posicion: { x: 10 } })).posicion, null);
  assert.equal(leerEstado(JSON.stringify({ abierta: true, posicion: { x: 'a', y: 3 } })).posicion, null);
});

test('solo `true` abre o pliega: un "true" de texto no', () => {
  const e = leerEstado(JSON.stringify({ abierta: 'true', plegada: 1, posicion: { x: 5, y: 6 } }));
  assert.equal(e.abierta, false);
  assert.equal(e.plegada, false);
  assert.deepEqual(e.posicion, { x: 5, y: 6 });
});

test('la primera vez se abre arriba a la derecha, sin salirse', () => {
  const p = posicionInicial(PORTATIL);
  assert.ok(p.x + ANCHO_VENTANA <= PORTATIL.ancho - MARGEN_VENTANA);
  assert.ok(p.y > 56, 'no tapa la barra superior del panel');
});

test('soltarla medio fuera la devuelve entera a la pantalla', () => {
  assert.deepEqual(acotarPosicion({ x: -200, y: -50 }, VENTANA, PORTATIL), { x: MARGEN_VENTANA, y: MARGEN_VENTANA });
  const p = acotarPosicion({ x: 5000, y: 5000 }, VENTANA, PORTATIL);
  assert.equal(p.x + VENTANA.ancho, PORTATIL.ancho - MARGEN_VENTANA);
  assert.equal(p.y + VENTANA.alto, PORTATIL.alto - MARGEN_VENTANA);
});

test('dentro de la pantalla no se toca', () => {
  assert.deepEqual(acotarPosicion({ x: 400, y: 200 }, VENTANA, PORTATIL), { x: 400, y: 200 });
});

test('si la pantalla encoge, la ventana que estaba abajo a la derecha sigue alcanzable', () => {
  const enMonitor = acotarPosicion({ x: 1500, y: 600 }, VENTANA, { ancho: 1920, alto: 1080 });
  const enPortatil = acotarPosicion(enMonitor, VENTANA, PORTATIL);
  assert.ok(enPortatil.x + VENTANA.ancho <= PORTATIL.ancho);
  assert.ok(enPortatil.y + VENTANA.alto <= PORTATIL.alto);
});

test('más alta que la pantalla: se queda arriba, que es donde está la barra para agarrarla', () => {
  const p = acotarPosicion({ x: 100, y: 300 }, { ancho: ANCHO_VENTANA, alto: 900 }, PORTATIL);
  assert.equal(p.y, MARGEN_VENTANA);
});
