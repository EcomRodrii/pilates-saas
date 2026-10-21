import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PARADAS_RECORRIDO, colocarBocadillo } from './recorrido.ts';

// El recorrido rápido del alta nueva (PR-5): tres paradas, sobre lo que ya hay.

const RAIZ = join(import.meta.dirname, '../..');
const leer = (f: string) => readFileSync(join(RAIZ, f), 'utf8');

test('tres paradas, con las preguntas de la maqueta', () => {
  assert.deepEqual(PARADAS_RECORRIDO.map(p => p.titulo), ['¿Qué es esta lista?', '¿Dónde está mi horario?', '¿Y si me atasco?']);
  assert.equal(PARADAS_RECORRIDO[0].texto, 'Lo que falta para abrir tu estudio, en orden. Se marca sola cuando lo haces: no tienes que tachar nada.');
  assert.equal(PARADAS_RECORRIDO[1].texto, 'En Calendario. Ahí creas y mueves tus clases, y ves quién viene a cada una.');
});

test('cada parada señala algo que existe en el código', () => {
  assert.ok(leer('components/guia/pon-en-marcha.tsx').includes('data-recorrido="lista"'), 'la lista');
  assert.ok(leer('components/layout/sidebar.tsx').includes('data-tour="menu-principal"'), 'el menú, el mismo ancla que la visita');
  assert.ok(leer('components/layout/whatsapp-fab.tsx').includes('data-whatsapp-soporte'), 'el WhatsApp de la esquina');
});

test('la tercera dice lo que hay junto al título: la «i» de AyudaDePantalla, no un «?»', () => {
  assert.match(PARADAS_RECORRIDO[2].texto, /«i»/);
  assert.match(leer('components/ayuda/AyudaDePantalla.tsx'), /IconoInfo/);
  assert.match(leer('lib/iconos.ts'), /Info as IconoInfo/);
});

test('el recorrido no tiene a Tenti ni arranca la visita de 43 pasos', () => {
  const src = leer('components/guia/recorrido-rapido.tsx');
  assert.doesNotMatch(src, /components\/tenti/);
  assert.doesNotMatch(src, /iniciarTour|empezarVisita/);
});

const VENTANA = { ancho: 1280, alto: 800 };
const TAM = { ancho: 290, alto: 150 };

test('el bocadillo va a la derecha de lo que señala si cabe', () => {
  const r = colocarBocadillo({ top: 100, left: 40, width: 220, height: 24 }, VENTANA, TAM);
  assert.equal(r.lado, 'derecha');
  assert.equal(r.left, 40 + 220 + 12);
  assert.ok(r.top >= 8 && r.top + TAM.alto <= VENTANA.alto - 8);
});

test('si no cabe a la derecha, debajo; si tampoco, encima; siempre dentro de la ventana', () => {
  const ancho = colocarBocadillo({ top: 100, left: 900, width: 340, height: 30 }, VENTANA, TAM);
  assert.equal(ancho.lado, 'abajo');
  assert.equal(ancho.top, 142);
  assert.ok(ancho.left + TAM.ancho <= VENTANA.ancho - 8);
  // El WhatsApp de la esquina: ni a la derecha ni debajo.
  const esquina = colocarBocadillo({ top: 720, left: 1200, width: 56, height: 56 }, VENTANA, TAM);
  assert.equal(esquina.lado, 'arriba');
  assert.equal(esquina.top, 720 - 12 - TAM.alto);
  assert.ok(esquina.left >= 8 && esquina.left + TAM.ancho <= VENTANA.ancho - 8);
});

test('en un móvil, el Calendario de la barra de abajo: encima', () => {
  const r = colocarBocadillo({ top: 760, left: 90, width: 70, height: 52 }, { ancho: 375, alto: 812 }, { ancho: 290, alto: 140 });
  assert.equal(r.lado, 'arriba');
  assert.ok(r.left >= 8 && r.left + 290 <= 375 - 8);
});
