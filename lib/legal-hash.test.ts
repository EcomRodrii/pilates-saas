import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashTextoLegal, normalizarTextoLegal } from './legal-hash.ts';

test('el mismo texto da la misma huella, siempre', () => {
  const t = 'Condiciones del estudio.\nSegunda línea.';
  assert.equal(hashTextoLegal(t), hashTextoLegal(t));
  assert.equal(hashTextoLegal(t).length, 64, 'SHA-256 completo, sin truncar');
});

test('cambiar una sola palabra cambia la huella', () => {
  // Es lo único que este módulo tiene que garantizar: si el estudio reescribe
  // sus condiciones, las compras anteriores siguen apuntando al texto viejo.
  const a = 'Cancelación gratuita hasta 12 horas antes.';
  const b = 'Cancelación gratuita hasta 24 horas antes.';
  assert.notEqual(hashTextoLegal(a), hashTextoLegal(b));
});

test('los finales de línea y los espacios sobrantes NO son un documento nuevo', () => {
  // Sin esto, guardar el mismo texto desde otro editor generaría una versión
  // distinta y la tabla se llenaría de duplicados sin que cambiara ni una
  // condición.
  const base = 'Primera línea.\nSegunda línea.';
  assert.equal(hashTextoLegal(base), hashTextoLegal('Primera línea.\r\nSegunda línea.'));
  assert.equal(hashTextoLegal(base), hashTextoLegal('Primera línea.   \nSegunda línea.  '));
  assert.equal(hashTextoLegal(base), hashTextoLegal('\n  Primera línea.\nSegunda línea.\n\n  '));
});

test('lo que SÍ cambia el documento cambia la huella', () => {
  // Mayúsculas, acentos y puntuación no se normalizan: cambian lo que dice.
  assert.notEqual(hashTextoLegal('No se admiten devoluciones.'), hashTextoLegal('no se admiten devoluciones.'));
  assert.notEqual(hashTextoLegal('Cancelación'), hashTextoLegal('Cancelacion'));
  // Y una línea en blanco EN MEDIO sí separa párrafos: no es espacio sobrante.
  assert.notEqual(hashTextoLegal('A\nB'), hashTextoLegal('A\n\nB'));
});

test('normalizar es idempotente', () => {
  const t = '  A  \r\n  B  \n\n';
  assert.equal(normalizarTextoLegal(normalizarTextoLegal(t)), normalizarTextoLegal(t));
});
