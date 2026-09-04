import test from 'node:test';
import assert from 'node:assert/strict';
import { traducirEnlace, destinoPortalViejo } from './deep-links.ts';

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

// ─── El catch-all `/portal/[slug]/[...resto]` ───────────────────────────────

test('una ruta con cola bajo `acceso`/`login` NO se redirige a sí misma', () => {
  // El bucle: el destino de estas tres empieza por `acceso`, que a su vez es
  // clave del mapa. Arrastrando la cola, `/portal/x/acceso/entrar` iba a
  // `/portal/x/acceso/login/entrar`, que volvía a entrar por el mismo handler y
  // crecía en cada salto → ERR_TOO_MANY_REDIRECTS, y con 308 el navegador se lo
  // quedaba cacheado.
  assert.equal(destinoPortalViejo(['acceso', 'entrar']), '/acceso/login');
  assert.equal(destinoPortalViejo(['login', 'algo']), '/acceso/login');
  assert.equal(destinoPortalViejo(['clave-nueva', 'tok-1']), '/acceso/verificar');

  // La prueba de que no hay reentrada: traducir el destino otra vez da lo
  // mismo. Si creciera aunque fuera un segmento, el bucle sigue vivo.
  for (const entrada of [['acceso', 'entrar'], ['login', 'a', 'b', 'c']]) {
    const uno = destinoPortalViejo(entrada)!;
    const dos = destinoPortalViejo(uno.split('/').filter(Boolean))!;
    assert.equal(dos, uno, entrada.join('/'));
  }
});

test('la cola SÍ se conserva donde el destino tiene segmento dinámico', () => {
  // Es la mitad del valor del enlace: un aviso de «tu clase de mañana» que
  // aterrice en el horario genérico ha perdido lo que traía.
  assert.equal(destinoPortalViejo(['clases', 'ses-1']), '/reservar/ses-1');
  assert.equal(destinoPortalViejo(['reservas', 'res-9']), '/mis-reservas/res-9');
  assert.equal(destinoPortalViejo(['compras', 'rec-3']), '/pagos/rec-3');
  // Y sin cola siguen funcionando, que es lo que ya funcionaba antes.
  assert.equal(destinoPortalViejo(['clases']), '/reservar');
  assert.equal(destinoPortalViejo(['acceso']), '/acceso/login');
});

test('lo desconocido es `null` (al inicio) y lo conocido sin pantalla es cadena vacía', () => {
  // Son dos cosas distintas: `null` = no la reconocemos; `''` = la conocemos y
  // todavía no tiene pantalla, así que al inicio del estudio.
  assert.equal(destinoPortalViejo(['loquesea']), null);
  assert.equal(destinoPortalViejo([]), null);
  assert.equal(destinoPortalViejo(undefined), null);
  assert.equal(destinoPortalViejo(['comunidad', 'hilo-1']), '');
  assert.equal(destinoPortalViejo(['mensajes']), '');
});
