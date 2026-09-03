import test from 'node:test';
import assert from 'node:assert/strict';
import { traducirEnlace } from './deep-links.ts';

// El deep link se calcula al INSERTAR y se persiste en `notification.deep_link`.
// Las filas ya emitidas en producción llevan rutas del portal borrado, y
// reescribir el catálogo no las arregla: solo alcanza a las nuevas. Estos tests
// defienden la traducción al LEER, que es lo único que llega a las viejas.

const SLUG = 'pilates-boutique';
const B = `/portal/${SLUG}`;

test('las rutas del portal borrado se traducen al árbol nuevo', () => {
  const casos: Array<[string, string]> = [
    [`/portal/${SLUG}/clases/ses-1`, `${B}/reservar/ses-1`],
    [`/portal/${SLUG}/clases`, `${B}/reservar`],
    [`/portal/${SLUG}/reservas?tab=ESPERA`, `${B}/mis-reservas`],
    [`/portal/${SLUG}/compras`, `${B}/pagos`],
    [`/portal/${SLUG}/notificaciones`, `${B}/notificaciones`],
  ];
  for (const [viejo, nuevo] of casos) {
    assert.equal(traducirEnlace(viejo, SLUG), nuevo, viejo);
  }
});

test('una ruta que ya es del árbol nuevo se deja intacta', () => {
  // Incluida la query: `?compra=ok` importa y no se puede perder.
  assert.equal(traducirEnlace(`${B}/bonos?compra=ok&plan=p1`, SLUG), `${B}/bonos?compra=ok&plan=p1`);
  assert.equal(traducirEnlace(`${B}/mis-reservas/res-9`, SLUG), `${B}/mis-reservas/res-9`);
});

test('lo que no se sabe traducir se queda SIN enlace', () => {
  // Una notificación que no lleva a ninguna parte es mejor que una que lleva al
  // sitio equivocado: `comunidad` y `mensajes` no tienen pantalla todavía.
  assert.equal(traducirEnlace(`/portal/${SLUG}/comunidad`, SLUG), undefined);
  assert.equal(traducirEnlace(`/portal/${SLUG}/mensajes/m-1`, SLUG), undefined);
});

test('las rutas de STAFF no se cuelan en la app de la alumna', () => {
  // 52 de los 70 deep links del catálogo son de panel. Mandar a una alumna a
  // /calendario o /cobros la deja en una pantalla que no es suya.
  for (const staff of ['/calendario?sesion=s1', '/cobros?tab=pendientes', '/clientas/soc-1', '/dashboard']) {
    assert.equal(traducirEnlace(staff, SLUG), undefined, staff);
  }
});

test('ausencia de enlace no rompe', () => {
  assert.equal(traducirEnlace(null, SLUG), undefined);
  assert.equal(traducirEnlace(undefined, SLUG), undefined);
  assert.equal(traducirEnlace('', SLUG), undefined);
});

test('el slug de la notificación vieja no manda: manda el del estudio actual', () => {
  // Una fila emitida con el slug antiguo del estudio (cambió de dirección) no
  // puede llevar a la alumna a un slug que ya no existe.
  assert.equal(traducirEnlace('/portal/slug-viejo/clases/ses-2', SLUG), `${B}/reservar/ses-2`);
});
