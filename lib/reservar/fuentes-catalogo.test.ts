import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FUENTES_WIDGET, fuenteDelCatalogo, pesosDe, reservaDe, familiaCssCatalogo,
  urlCatalogoGoogle, RESERVA_SANS, RESERVA_SERIF,
} from './fuentes-catalogo.ts';
import { familiaCssDe, urlFuenteGoogle, fuenteValida } from './config-widget.ts';

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

test('⚠️ los pesos son los que Google publica DE VERDAD, no un juego fijo', () => {
  // La regresión concreta: se pedía `wght@400;500;600;700` para toda familia.
  // Instrument Serif —la fuente de titulares por defecto— solo publica el 400,
  // así que el navegador no encontraba el 600 del titular y lo falsificaba
  // engordando el trazo. Comprobado contra la API de Google el 2026-08-20.
  const serif = fuenteDelCatalogo('Instrument Serif');
  assert.deepEqual(serif?.pesos, [400]);
  assert.deepEqual(pesosDe('Instrument Serif'), [400]);
  assert.ok(urlFuenteGoogle('Instrument Serif')!.includes(':wght@400&'));
  assert.ok(!urlFuenteGoogle('Instrument Serif')!.includes('600'));

  // Y una que sí los tiene los sigue pidiendo enteros.
  assert.deepEqual(pesosDe('Inter'), [400, 500, 600, 700]);
  assert.ok(urlFuenteGoogle('Inter')!.includes(':wght@400;500;600;700&'));
});

test('una familia de fuera del catálogo se comporta EXACTAMENTE como antes', () => {
  // El campo admitía texto libre y hay estudios con una familia ya guardada.
  // Ni deja de cargarse ni cambia de pesos ni de pila de reserva.
  assert.equal(fuenteDelCatalogo('Space Grotesk'), null);
  assert.deepEqual(pesosDe('Space Grotesk'), [400, 500, 600, 700]);
  assert.equal(familiaCssDe('Lobster'), `'Lobster', ${RESERVA_SANS}`);
  assert.ok(urlFuenteGoogle('Space Grotesk')!.includes('family=Space+Grotesk:wght@400;500;600;700'));
});

test('una serif cae en una serif mientras carga, no en una sans', () => {
  // Con la pila de sans detrás de Playfair, el titular se veía en system-ui
  // hasta que llegaba la fuente y pegaba un salto de forma y de ancho.
  assert.equal(reservaDe('Playfair Display'), RESERVA_SERIF);
  assert.equal(reservaDe('Inter'), RESERVA_SANS);
  assert.equal(reservaDe(null), RESERVA_SANS);
  assert.equal(familiaCssDe('Playfair Display'), `'Playfair Display', ${RESERVA_SERIF}`);
  assert.equal(familiaCssCatalogo(fuenteDelCatalogo('Fraunces')!), `'Fraunces', ${RESERVA_SERIF}`);
});

test('fuenteDelCatalogo no distingue mayúsculas ni espacios de sobra', () => {
  assert.equal(fuenteDelCatalogo('  inter ')?.familia, 'Inter');
  assert.equal(fuenteDelCatalogo('PLAYFAIR DISPLAY')?.familia, 'Playfair Display');
  assert.equal(fuenteDelCatalogo(''), null);
  assert.equal(fuenteDelCatalogo(undefined), null);
});

test('la muestra del selector se pide en UNA sola petición, sin pesos inventados', () => {
  const url = urlCatalogoGoogle();
  assert.equal(url.split('family=').length - 1, 10);
  assert.ok(url.includes('display=swap'));
  assert.ok(url.includes('family=Plus+Jakarta+Sans'), 'los espacios van como + , no como %20');
  // La muestra solo necesita normal y semi... salvo donde el semi no existe.
  assert.ok(url.includes('family=Instrument+Serif:wght@400&'));
  assert.ok(url.includes('family=Inter:wght@400;600'));
});
