import test from 'node:test';
import assert from 'node:assert/strict';
import { extraerColorDeclarado, extraerColorDeMarca } from './extraer-tema.ts';

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

// ── extraerColorDeMarca: automática de verdad, nunca bloquea ────────────────
// El pedido explícito fue "que sea automático, nada de reglas que digan
// 'este tema no declara un color extraíble'" — estos tests fijan que la
// función SIEMPRE devuelve algo, para ZIPs que no traen el contrato de
// data-props (la inmensa mayoría).

test('extraerColorDeMarca: el contrato declarado sigue ganando cuando existe', () => {
  const props = JSON.stringify({ brand: { default: '#333B24' } }).replace(/"/g, '&quot;');
  const html = `<script data-dc-script data-props="${props}">x</script><style>:root{--otro:#1a73e8}</style><div style="color:#1a73e8">x</div><div style="color:#1a73e8">x</div>`;
  assert.equal(extraerColorDeMarca(html), '#333B24');
});

test('extraerColorDeMarca: ⚠️ un verde oliva apagado (#333B24, diferencia de 23 entre canales) NO se confunde con un gris', () => {
  // Es EL color real que este arreglo tenía que dejar de perder: con un
  // umbral de neutralidad mal calibrado, este mismo hex se descartaba como
  // "gris" y la extracción caía al verde de fábrica en vez del de verdad.
  const html = `<style>:root{--marca:#333B24}</style><div style="background:#333B24">a</div><div style="color:#333B24">b</div>`;
  assert.equal(extraerColorDeMarca(html), '#333b24');
});

test('extraerColorDeMarca: sin contrato, usa la variable CSS declarada Y más usada — sea cual sea su nombre', () => {
  // Nombre de variable arbitrario ("--acento-2"), no "brand"/"primary": la
  // heurística no depende de adivinar el nombre.
  const html = `
    <style>:root{--gris-fondo:#e7e4db;--acento-2:#c0392b}</style>
    <div style="background:#e7e4db">fondo</div>
    <div style="color:#c0392b">a</div>
    <div style="border-color:#c0392b">b</div>
    <div style="color:#c0392b">c</div>
  `;
  assert.equal(extraerColorDeMarca(html), '#c0392b');
});

test('extraerColorDeMarca: sin ninguna variable CSS, cae al color no-neutro más repetido del documento', () => {
  const html = `<div style="color:#2e7d32">a</div><span style="border:1px solid #2e7d32">b</span><p style="color:#2e7d32">c</p><i style="color:#9e9e9e">gris, una vez</i>`;
  assert.equal(extraerColorDeMarca(html), '#2e7d32');
});

test('extraerColorDeMarca: un documento sin ningún color (o solo neutros) no bloquea — cae al verde de fábrica', () => {
  assert.equal(extraerColorDeMarca('<div>sin estilos</div>'), '#343825');
  assert.equal(extraerColorDeMarca('<style>:root{--fondo:#ffffff;--texto:#333333}</style>'), '#343825');
});
