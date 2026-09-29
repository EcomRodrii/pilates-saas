import test from 'node:test';
import assert from 'node:assert/strict';
import { FUENTES_WIDGET, fuenteDelCatalogo, reservaDe, RESERVA_SANS, RESERVA_SERIF } from './fuentes-catalogo.ts';
import { familiaCssDe, fuenteValida } from './config-widget.ts';

test('el catálogo son diez familias, sin repetidas', () => {
  assert.equal(FUENTES_WIDGET.length, 10);
  const familias = new Set(FUENTES_WIDGET.map(f => f.familia));
  assert.equal(familias.size, 10);
});

test('toda familia del catálogo pasa la puerta anti-XSS del snippet', () => {
  // Si una entrada no pasara `fuenteValida`, se podría elegir en el panel y el
  // parser la tiraría después sin decir nada: el control existiría y no haría
  // nada, que es justo lo que no puede pasar.
  for (const f of FUENTES_WIDGET) {
    assert.ok(fuenteValida(f.familia), `${f.familia} no pasa fuenteValida`);
  }
});

test('una familia de fuera del catálogo se sigue nombrando con su reserva', () => {
  // El campo admitía texto libre y puede haber códigos con una familia ya
  // escrita. No se pide a nadie (lib/widget/fuentes-nativa.ts), pero la pila
  // es la de siempre.
  assert.equal(fuenteDelCatalogo('Space Grotesk'), null);
  assert.equal(familiaCssDe('Lobster'), `'Lobster', ${RESERVA_SANS}`);
});

test('una serif cae en una serif mientras carga, no en una sans', () => {
  // Con la pila de sans detrás de Playfair, el titular se veía en system-ui
  // hasta que llegaba la fuente y pegaba un salto de forma y de ancho.
  assert.equal(reservaDe('Playfair Display'), RESERVA_SERIF);
  assert.equal(reservaDe('Inter'), RESERVA_SANS);
  assert.equal(reservaDe(null), RESERVA_SANS);
  assert.equal(familiaCssDe('Playfair Display'), `'Playfair Display', ${RESERVA_SERIF}`);
  assert.equal(familiaCssDe('Fraunces'), `'Fraunces', ${RESERVA_SERIF}`);
});

test('fuenteDelCatalogo no distingue mayúsculas ni espacios de sobra', () => {
  assert.equal(fuenteDelCatalogo('  inter ')?.familia, 'Inter');
  assert.equal(fuenteDelCatalogo('PLAYFAIR DISPLAY')?.familia, 'Playfair Display');
  assert.equal(fuenteDelCatalogo(''), null);
  assert.equal(fuenteDelCatalogo(undefined), null);
});
