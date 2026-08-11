import test from 'node:test';
import assert from 'node:assert/strict';
import { sanearMarkdown, esEnlaceSeguro } from './sanear-markdown.ts';

// El motivo de que esto exista: <Markdown> de react-email no sanea NADA.
// Cada caso de abajo se comprobó primero renderizando de verdad y viendo el
// HTML crudo salir intacto.

test('deja pasar el formato normal sin tocarlo', () => {
  const md = '**Hola** _Ana_\n\n- uno\n- dos\n\n[portal](https://tentare.app)';
  assert.equal(sanearMarkdown(md), md);
});

test('neutraliza un <script> sin borrar el texto de alrededor', () => {
  const salida = sanearMarkdown('<script>alert(1)</script>\n\nHola');
  assert.ok(!salida.includes('<script'), 'no debe quedar la etiqueta abierta');
  assert.ok(salida.includes('Hola'), 'el texto legítimo se conserva');
  assert.ok(salida.includes('&lt;script'), 'se ve como texto, no desaparece');
});

test('neutraliza un img con onerror', () => {
  const salida = sanearMarkdown('<img src=x onerror="alert(1)">');
  assert.ok(!salida.includes('<img'));
  assert.ok(salida.includes('&lt;img'));
});

test('un enlace javascript: pierde el enlace pero conserva el texto', () => {
  assert.equal(sanearMarkdown('[pincha](javascript:alert(1))'), 'pincha');
});

test('tambien caen data:, vbscript: y file:', () => {
  assert.equal(sanearMarkdown('[a](data:text/html,<b>x</b>)'), 'a');
  assert.equal(sanearMarkdown('[b](vbscript:msgbox)'), 'b');
  assert.equal(sanearMarkdown('[c](file:///etc/passwd)'), 'c');
});

test('una imagen con origen invalido se queda en su texto alternativo', () => {
  assert.equal(sanearMarkdown('![gato](javascript:alert(1))'), 'gato');
});

test('una imagen con origen https se mantiene entera', () => {
  const md = '![gato](https://cdn.ejemplo.com/gato.png)';
  assert.equal(sanearMarkdown(md), md);
});

test('respeta el titulo opcional de un enlace valido', () => {
  const md = '[portal](https://tentare.app "Tu portal")';
  assert.equal(sanearMarkdown(md), md);
});

test('mailto y tel valen; una url relativa no', () => {
  assert.ok(esEnlaceSeguro('mailto:hola@estudio.com'));
  assert.ok(esEnlaceSeguro('tel:+34600111222'));
  assert.ok(!esEnlaceSeguro('/portal/aravaca'));
  assert.ok(!esEnlaceSeguro('//evil.example'));
  assert.ok(!esEnlaceSeguro(''));
});

test('un salto de linea dentro del esquema no cuela javascript:', () => {
  assert.ok(!esEnlaceSeguro('java\nscript:alert(1)'));
  assert.ok(!esEnlaceSeguro('java\tscript:alert(1)'));
  assert.ok(!esEnlaceSeguro(' javascript:alert(1)'.replace(' ', '')));
});

test('es idempotente: sanear dos veces da lo mismo', () => {
  const casos = [
    '<script>x</script> **hola**',
    '[a](javascript:1) y [b](https://ok.com)',
    'Pilates & Co <b>negrita</b>',
    '&lt;ya escapado&gt;',
  ];
  for (const md of casos) {
    const una = sanearMarkdown(md);
    assert.equal(sanearMarkdown(una), una, `no idempotente: ${md}`);
  }
});

test('no reescribe un ampersand normal del texto', () => {
  assert.equal(sanearMarkdown('Pilates & Co'), 'Pilates & Co');
});
