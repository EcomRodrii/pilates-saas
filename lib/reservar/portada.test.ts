import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BORDE_CRISTAL_SOBRE_FOTO, COLUMNA_HORARIO, CRISTAL_SOBRE_FOTO, PARADAS_VELO, TINTA_SOBRE_CREMA, TINTA_SOBRE_FOTO, TINTA_SUAVE_SOBRE_FOTO,
  VELO_MINIMO, componerSobre, peorFondoBajoVelo, veloPortadaCss,
} from './portada.ts';
import { ratioContraste } from '../wcag-contrast.ts';

// ─────────────────────────────────────────────────────────────────────────────
// El texto de la portada de /reservar va sobre la foto que suba cada estudio,
// y el medidor de contraste del navegador no ve fotos. Estos tests lo miden
// contra el PEOR píxel posible —blanco puro bajo el velo—: si pasa ahí, pasa
// sobre cualquier foto.
// ─────────────────────────────────────────────────────────────────────────────

const AA = 4.5;
const r = (a: string, b: string) => ratioContraste(a, b) ?? 0;
const alfaDe = (rgba: string) => Number(/,([\d.]+)\)$/.exec(rgba)![1]);

test('el velo nunca baja del mínimo, y el mínimo es la parada más clara', () => {
  assert.equal(VELO_MINIMO, Math.min(...PARADAS_VELO.map(([, a]) => a)));
  // Las paradas van de arriba abajo: si se desordenaran, el navegador las
  // pintaría igual pero la cuenta de «el tramo más claro» dejaría de valer.
  const posiciones = PARADAS_VELO.map(([p]) => p);
  assert.deepEqual(posiciones, [...posiciones].sort((a, b) => a - b));
  assert.equal(posiciones[0], 0);
  assert.equal(posiciones[posiciones.length - 1], 100);
});

test('el velo como CSS lleva todas las paradas, en orden', () => {
  const css = veloPortadaCss();
  assert.match(css, /^linear-gradient\(180deg, /);
  for (const [p, a] of PARADAS_VELO) assert.ok(css.includes(`rgba(8,8,8,${a}) ${p}%`), `falta la parada ${p}%`);
});

test('el texto pequeño (subtítulo) pasa AA sobre un píxel blanco con el velo más claro', () => {
  const fondo = peorFondoBajoVelo(VELO_MINIMO);
  assert.ok(r(TINTA_SOBRE_FOTO, fondo) >= AA, `${r(TINTA_SOBRE_FOTO, fondo).toFixed(2)}:1 sobre ${fondo}`);
});

test('la ciudad, un punto más suave, también pasa AA en el tramo más claro', () => {
  const fondo = peorFondoBajoVelo(VELO_MINIMO);
  const tinta = componerSobre(TINTA_SUAVE_SOBRE_FOTO, fondo);
  assert.ok(tinta);
  assert.ok(r(tinta!, fondo) >= AA, `${r(tinta!, fondo).toFixed(2)}:1`);
});

test('los botones de cristal (Acceder, menú) se leen sobre el velo más claro', () => {
  const fondo = peorFondoBajoVelo(VELO_MINIMO, { color: '#080808', alfa: alfaDe(CRISTAL_SOBRE_FOTO) });
  assert.ok(r(TINTA_SOBRE_FOTO, fondo) >= AA, `${r(TINTA_SOBRE_FOTO, fondo).toFixed(2)}:1`);
});

test('el borde del cristal se distingue del velo (3:1 de componente, WCAG 1.4.11)', () => {
  // Sobre una foto OSCURA —el caso contrario—: ahí es el borde lo que dice que
  // hay un botón. Se mide contra el velo sobre negro puro.
  const fondo = peorFondoBajoVelo(1);
  const borde = componerSobre(BORDE_CRISTAL_SOBRE_FOTO, fondo);
  assert.ok(borde);
  assert.ok(r(borde!, fondo) >= 3, `${r(borde!, fondo).toFixed(2)}:1`);
});

test('el botón relleno de crema lleva una tinta que se lee encima', () => {
  assert.ok(r(TINTA_SOBRE_CREMA, TINTA_SOBRE_FOTO) >= AA);
});

test('la columna del horario es la que pidió el fundador (~720 px)', () => {
  assert.ok(COLUMNA_HORARIO >= 680 && COLUMNA_HORARIO <= 760);
});
