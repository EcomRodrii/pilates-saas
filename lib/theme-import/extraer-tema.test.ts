import test from 'node:test';
import assert from 'node:assert/strict';
import { extraerColorDeclarado } from './extraer-tema.ts';

test('extraerColorDeclarado: lee el default de la prop brand', () => {
  const props = JSON.stringify({
    studioName: { editor: 'text', default: 'Estudio Alma' },
    brand: { editor: 'color', default: '#333B24' },
  }).replace(/"/g, '&quot;');
  const html = `<script data-dc-script data-props="${props}">x</script>`;

  assert.equal(extraerColorDeclarado(html), '#333B24');
});

test('extraerColorDeclarado: sin data-props, o con JSON roto, devuelve null', () => {
  assert.equal(extraerColorDeclarado('<div>hola</div>'), null);
  assert.equal(extraerColorDeclarado('<script data-dc-script data-props="{esto no es json">x</script>'), null);
});

test('extraerColorDeclarado: sin prop brand declarada, devuelve null — nunca adivina', () => {
  const props = JSON.stringify({
    studioName: { editor: 'text', default: 'Estudio Alma' },
  }).replace(/"/g, '&quot;');
  const html = `<script data-dc-script data-props="${props}">x</script>`;

  assert.equal(extraerColorDeclarado(html), null);
});

test('extraerColorDeclarado: un default que no es un hex válido se descarta', () => {
  const props = JSON.stringify({
    brand: { editor: 'color', default: 'no soy un color' },
  }).replace(/"/g, '&quot;');
  const html = `<script data-dc-script data-props="${props}">x</script>`;

  assert.equal(extraerColorDeclarado(html), null);
});

test('extraerColorDeclarado: acepta el shorthand #RGB, igual que el resto del repo (hexARgb)', () => {
  const props = JSON.stringify({ brand: { default: '#333' } }).replace(/"/g, '&quot;');
  const html = `<script data-dc-script data-props="${props}">x</script>`;
  assert.equal(extraerColorDeclarado(html), '#333');
});
