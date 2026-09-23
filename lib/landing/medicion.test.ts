import { test } from 'node:test';
import assert from 'node:assert/strict';
import { destinoDeEnlace, ubicacionDe, type MarcaAncestro } from './medicion.ts';

const ORIGEN = 'https://www.tentare.app';

test('el alta se reconoce con ruta relativa, absoluta y barra final', () => {
  assert.equal(destinoDeEnlace('/crear-estudio', ORIGEN), 'alta');
  assert.equal(destinoDeEnlace('https://www.tentare.app/crear-estudio', ORIGEN), 'alta');
  assert.equal(destinoDeEnlace('/crear-estudio/', ORIGEN), 'alta');
  // Con query (utm, plan elegido…) sigue siendo el alta.
  assert.equal(destinoDeEnlace('/crear-estudio?plan=ESTUDIO', ORIGEN), 'alta');
});

test('una ruta que solo EMPIEZA igual no es el alta', () => {
  assert.equal(destinoDeEnlace('/crear-estudio-demo', ORIGEN), null);
  assert.equal(destinoDeEnlace('/precios', ORIGEN), null);
});

test('el mismo path en otro dominio no cuenta como nuestro alta', () => {
  assert.equal(destinoDeEnlace('https://otro.example/crear-estudio', ORIGEN), null);
});

test('WhatsApp por wa.me y por api.whatsapp.com', () => {
  assert.equal(destinoDeEnlace('https://wa.me/34640515871?text=Hola', ORIGEN), 'whatsapp');
  assert.equal(destinoDeEnlace('https://api.whatsapp.com/send?phone=34640515871', ORIGEN), 'whatsapp');
});

test('sin href, anclas y basura: nada que medir', () => {
  assert.equal(destinoDeEnlace(null, ORIGEN), null);
  assert.equal(destinoDeEnlace('', ORIGEN), null);
  assert.equal(destinoDeEnlace('#precio', ORIGEN), null);
  assert.equal(destinoDeEnlace('http://[roto', ORIGEN), null);
});

const s = (id?: string): MarcaAncestro => ({ tag: 'section', id });

test('la ubicación la decide el antepasado más cercano con nombre', () => {
  assert.equal(ubicacionDe([{ tag: 'div' }, { tag: 'nav' }, { tag: 'div' }]), 'nav');
  assert.equal(ubicacionDe([{ tag: 'div' }, { tag: 'header', id: 'top' }]), 'hero');
  assert.equal(ubicacionDe([{ tag: 'div' }, s('precio'), { tag: 'main' }]), 'precio');
  assert.equal(ubicacionDe([{ tag: 'section', ctaFinal: true }]), 'cta_final');
  assert.equal(ubicacionDe([{ tag: 'div' }, { tag: 'footer' }]), 'pie');
});

test('el popup gana a la sección que tenga debajo', () => {
  // PopupEmpezar se monta dentro del árbol de la página: sin esta prioridad,
  // su botón se contaría como de la sección que lo envuelve.
  assert.equal(ubicacionDe([{ tag: 'div', rol: 'dialog' }, s('app')]), 'popup');
});

test('el menú móvil es un dialog, pero no es el popup', () => {
  assert.equal(ubicacionDe([{ tag: 'div', clases: 'v5-menu', rol: 'dialog' }]), 'menu_movil');
});

test('el botón flotante de WhatsApp tiene nombre propio', () => {
  assert.equal(ubicacionDe([{ tag: 'div', clases: 'v5-wa-panel' }, { tag: 'div', clases: 'v5-wa-fab' }]), 'flotante');
  // Una clase que solo contiene el nombre no cuenta.
  assert.equal(ubicacionDe([{ tag: 'div', clases: 'v5-wa-fab-extra' }]), 'otro');
});

test('un <header> interno de sección no es el hero', () => {
  // Varias secciones tienen su propio <header> (v5-cal-head, v5-res-head…).
  assert.equal(ubicacionDe([{ tag: 'header' }, s('calendario')]), 'calendario');
});

test('sin nada reconocible: «otro»', () => {
  assert.equal(ubicacionDe([{ tag: 'div' }, { tag: 'section' }]), 'otro');
  assert.equal(ubicacionDe([]), 'otro');
});
