import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rutaConTravesia } from './ruta-segura.ts';

test('rutaConTravesia: rechaza ".." en cualquier segmento', () => {
  assert.equal(rutaConTravesia('../otro-studio/index.html'), true);
  assert.equal(rutaConTravesia('assets/../../fuera/x.css'), true);
  assert.equal(rutaConTravesia('a/b/../../../c'), true);
});

test('rutaConTravesia: rechaza segmentos vacíos (dobles barras, barra inicial)', () => {
  assert.equal(rutaConTravesia('/absoluta.html'), true);
  assert.equal(rutaConTravesia('a//b.css'), true);
});

test('rutaConTravesia: deja pasar rutas relativas normales', () => {
  assert.equal(rutaConTravesia('index.html'), false);
  assert.equal(rutaConTravesia('assets/styles.css'), false);
  assert.equal(rutaConTravesia('temas-importados/studio-1/abc/index.html'), false);
  // Espacios y acentos son legítimos en este importador — no deben rechazarse.
  assert.equal(rutaConTravesia('fuentes/Plus Jakarta Sans.woff2'), false);
  assert.equal(rutaConTravesia('imágenes/logo.png'), false);
});
