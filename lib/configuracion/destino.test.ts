import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  ANCLAS, RUTAS_ANTIGUAS, esAnclaConocida, hrefDeHerramienta, hrefDeSeccion, hrefDeTarjeta, lugarDeTarjeta,
  puedeAbrirEnConfiguracion, reconoceSub, reconoceTab, resolverDestino, resolverHref, seccionesVisibles,
} from './destino.ts';
import {
  HERRAMIENTAS, SECCIONES, esHerramientaId, herramientaDeTarjeta, seccionDeTarjeta, seccionPorId,
  type SeccionId, type TarjetaId,
} from './secciones.ts';
import { TARJETA_DE_INTEGRACION } from './resumenes.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Los enlaces a Configuración aterrizan donde dicen.
//
// Tres cosas, de más concreta a más general:
//   1. la tabla de casos: cada enlace viejo, cada sub-pestaña de antes y cada
//      vuelta de una conexión, con la sección y la tarjeta a la que llega hoy;
//   2. que los ids de secciones.ts son los que se pintan de verdad (si alguien
//      renombra una tarjeta en un componente y no aquí, ningún enlace llegaría);
//   3. un barrido del repo: todo `/configuracion?…` escrito a mano tiene que
//      llegar a una sección y a una tarjeta que existan. Es el mismo tipo de
//      fallo que `sub=canjes` abriendo Recompensas: no rompe nada, solo manda
//      a otro sitio.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..', '..');

test('tabla: cada enlace llega a su sección y a su tarjeta', () => {
  const casos: [string, ReturnType<typeof resolverHref>][] = [
    // Los que aterrizaban mal (auditoría del 15-sep).
    // (Desde el 15-sep, v2, canjes y salas viven en la pantalla de su herramienta.)
    ['/configuracion?tab=gamificacion&sub=canjes', { tab: 'motivacion', abrir: 'recompensas-y-logros', ancla: 'canjes' }],
    ['/configuracion?tab=clases-salas&sub=salas', { tab: 'estudio', abrir: 'salas' }],
    ['/configuracion?tab=estudio&sub=salas', { tab: 'estudio', abrir: 'salas' }],
    ['/configuracion?tab=estudio&sub=general#datos-fiscales', { tab: 'cobros', ancla: 'datos-fiscales' }],
    // Las vueltas de una conexión, sin `tab=` o con uno viejo: a la sección que
    // pinta HOY su tarjeta, que es la única que enseña el aviso.
    ['/configuracion?stripe_connected=1', { tab: 'cobros', ancla: 'integracion-stripe' }],
    ['/configuracion?stripe_connect_error=Stripe%20no%20configurado', { tab: 'cobros', ancla: 'integracion-stripe' }],
    ['/configuracion?gmail_connected=1', { tab: 'comunicacion', ancla: 'integracion-gmail' }],
    ['/configuracion?gmail_error=x', { tab: 'comunicacion', ancla: 'integracion-gmail' }],
    ['/configuracion?google_calendar_connected=1', { tab: 'conexiones', ancla: 'integracion-google_calendar' }],
    ['/configuracion?google_calendar_error=x', { tab: 'conexiones', ancla: 'integracion-google_calendar' }],
    ['/configuracion?zoom_connected=1', { tab: 'conexiones', ancla: 'integracion-zoom' }],
    ['/configuracion?zoom_error=x', { tab: 'conexiones', ancla: 'integracion-zoom' }],
    ['/configuracion?klaviyo_connected=1', { tab: 'conexiones', ancla: 'integracion-klaviyo' }],
    ['/configuracion?klaviyo_error=x', { tab: 'conexiones', ancla: 'integracion-klaviyo' }],
    // «Más integraciones» se partió en una fila por conexión (15-sep, v2): su ancla, a la primera.
    ['/configuracion?tab=conexiones#mas-integraciones', { tab: 'conexiones', ancla: 'integracion-kisi' }],
    ['/configuracion?whatsapp_connected=1', { tab: 'comunicacion', ancla: 'integracion-whatsapp' }],
    // Lo que mandaban los cinco callbacks y el Embedded Signup hasta el 15-sep.
    ['/configuracion?tab=integraciones&stripe_connected=1', { tab: 'cobros', ancla: 'integracion-stripe' }],
    ['/configuracion?tab=integraciones&gmail_connected=1', { tab: 'comunicacion', ancla: 'integracion-gmail' }],
    ['/configuracion?tab=integraciones&google_calendar_connected=1', { tab: 'conexiones', ancla: 'integracion-google_calendar' }],
    ['/configuracion?tab=integraciones&zoom_error=x', { tab: 'conexiones', ancla: 'integracion-zoom' }],
    ['/configuracion?tab=integraciones&klaviyo_connected=1', { tab: 'conexiones', ancla: 'integracion-klaviyo' }],
    ['/configuracion?tab=conexiones&whatsapp_connected=1', { tab: 'comunicacion', ancla: 'integracion-whatsapp' }],
    // Lo que mandan hoy.
    ['/configuracion?tab=cobros&stripe_connected=1', { tab: 'cobros', ancla: 'integracion-stripe' }],
    ['/configuracion?tab=comunicacion&gmail_connected=1', { tab: 'comunicacion', ancla: 'integracion-gmail' }],
    ['/configuracion?tab=comunicacion&whatsapp_connected=1', { tab: 'comunicacion', ancla: 'integracion-whatsapp' }],
    // Tarjetas que cambiaron de sección el 15-sep: su ancla las sigue.
    ['/configuracion?tab=conexiones#integracion-stripe', { tab: 'cobros', ancla: 'integracion-stripe' }],
    ['/configuracion?tab=conexiones#integracion-whatsapp', { tab: 'comunicacion', ancla: 'integracion-whatsapp' }],
    ['/configuracion?tab=integraciones#integracion-resend', { tab: 'comunicacion', ancla: 'integracion-resend' }],
    // «Exportar a Excel» se retiró: su ancla lleva a la única exportación que queda.
    ['/configuracion?tab=conexiones#integracion-excel', { tab: 'datos', ancla: 'exportar' }],
    ['/configuracion?tab=integraciones#integracion-excel', { tab: 'datos', ancla: 'exportar' }],
    ['/configuracion?tab=datos#integracion-excel', { tab: 'datos', ancla: 'exportar' }],
    ['/configuracion#integracion-excel', { tab: 'datos', ancla: 'exportar' }],
    // «Marca» salió de «Mi app y mi web» (v2): la tarjeta de antes es hoy una
    // sección, y su ancla lleva al logo.
    ['/configuracion?tab=estudio#marca', { tab: 'marca', ancla: 'logo-y-favicon' }],
    ['/configuracion?tab=web#marca', { tab: 'marca', ancla: 'logo-y-favicon' }],
    ['/configuracion?tab=estudio#textos-de-tu-app', { tab: 'marca', ancla: 'textos-de-tu-app' }],
    ['/configuracion?tab=web#textos-de-tu-app', { tab: 'marca', ancla: 'textos-de-tu-app' }],
    ['/configuracion?tab=marca', { tab: 'marca' }],
    ['/configuracion?tab=avisos', { tab: 'avisos' }],
    ['/configuracion?tab=panel', { tab: 'panel' }],
    ['/configuracion?tab=estudio#catalogo-de-la-cadena', { tab: 'clases', ancla: 'catalogo-de-la-cadena' }],
    ['/configuracion?tab=web#aplicaciones-con-acceso', { tab: 'conexiones', ancla: 'aplicaciones-con-acceso' }],
    ['/configuracion?suscripcion=ok', { redirect: '/suscripcion?suscripcion=ok' }],
    ['/configuracion?suscripcion=cancel', { redirect: '/suscripcion?suscripcion=cancel' }],
    // Lo que ya vive fuera de Configuración.
    ['/configuracion?tab=planes', { redirect: '/productos' }],
    ['/configuracion?tab=perfil', { redirect: '/mi-perfil' }],
    ['/configuracion?tab=mi-perfil', { redirect: '/mi-perfil' }],
    // Las doce pestañas de antes.
    ['/configuracion?tab=clases-salas', { tab: 'clases' }],
    ['/configuracion?tab=citas', { tab: 'clases', ancla: 'servicios-de-cita' }],
    ['/configuracion?tab=gamificacion', { tab: 'motivacion' }],
    ['/configuracion?tab=integraciones', { tab: 'conexiones' }],
    ['/configuracion?tab=estudio', { tab: 'estudio' }],
    ['/configuracion?tab=descubre', { tab: 'web', abrir: 'contenido-de-tu-app' }],
    ['/configuracion?tab=api', { tab: 'web', abrir: 'widgets' }],
    ['/configuracion?tab=campos', { tab: 'altas', ancla: 'datos-extra-de-la-ficha' }],
    ['/configuracion?tab=cuestionario-salud', { tab: 'altas', ancla: 'cuestionario-de-salud' }],
    ['/configuracion?tab=plantillas', { tab: 'comunicacion', abrir: 'correos-automaticos' }],
    ['/configuracion?tab=backups', { tab: 'datos', ancla: 'exportar' }],
    // Sus sub-pestañas.
    ['/configuracion?tab=clases-salas&sub=clases', { tab: 'clases', abrir: 'tipos-de-clase' }],
    ['/configuracion?tab=citas&sub=servicios', { tab: 'clases', ancla: 'servicios-de-cita' }],
    ['/configuracion?tab=citas&sub=horario', { tab: 'clases', ancla: 'horario-de-citas' }],
    ['/configuracion?tab=gamificacion&sub=recompensas', { tab: 'motivacion', abrir: 'recompensas-y-logros', ancla: 'recompensas' }],
    ['/configuracion?tab=gamificacion&sub=logros', { tab: 'motivacion', abrir: 'recompensas-y-logros', ancla: 'logros' }],
    ['/configuracion?tab=gamificacion&sub=niveles', { tab: 'motivacion', abrir: 'recompensas-y-logros', ancla: 'niveles' }],
    ['/configuracion?tab=gamificacion&sub=retos', { tab: 'motivacion', abrir: 'recompensas-y-logros', ancla: 'retos' }],
    ['/configuracion?tab=estudio&sub=general', { tab: 'estudio' }],
    ['/configuracion?tab=estudio&sub=sedes', { tab: 'estudio', ancla: 'sedes' }],
    ['/configuracion?tab=estudio&sub=horario', { tab: 'estudio', ancla: 'horario' }],
    // Mi estudio en filas con cajón (15-sep, v2): las anclas de antes abren su cajón.
    ['/configuracion?tab=estudio#horario-y-cierres', { tab: 'estudio', ancla: 'horario' }],
    ['/configuracion?tab=estudio#datos-y-contacto', { tab: 'estudio', ancla: 'nombre-y-direccion' }],
    ['/configuracion?tab=estudio#cerrar-el-centro', { tab: 'estudio', ancla: 'cerrar-el-centro' }],
    ['/configuracion?tab=estudio&sub=reservas', { tab: 'reservas' }],
    ['/configuracion?tab=estudio&sub=cobros', { tab: 'cobros' }],
    ['/configuracion?tab=estudio&sub=enlaces', { tab: 'web', ancla: 'direccion-y-enlaces' }],
    ['/configuracion?tab=estudio&sub=legal', { tab: 'altas', ancla: 'contrato-y-privacidad' }],
    ['/configuracion?tab=api&sub=widgets', { tab: 'web', abrir: 'widgets' }],
    ['/configuracion?tab=api&sub=crecimiento', { tab: 'web', abrir: 'widgets' }],
    // Los alias que ya existían.
    ['/configuracion?tab=recompensas', { tab: 'motivacion', abrir: 'recompensas-y-logros', ancla: 'recompensas' }],
    ['/configuracion?tab=canjes', { tab: 'motivacion', abrir: 'recompensas-y-logros', ancla: 'canjes' }],
    ['/configuracion?tab=logros', { tab: 'motivacion', abrir: 'recompensas-y-logros', ancla: 'logros' }],
    ['/configuracion?tab=niveles', { tab: 'motivacion', abrir: 'recompensas-y-logros', ancla: 'niveles' }],
    ['/configuracion?tab=retos', { tab: 'motivacion', abrir: 'recompensas-y-logros', ancla: 'retos' }],
    ['/configuracion?tab=clases', { tab: 'clases' }],
    ['/configuracion?tab=salas', { tab: 'estudio', abrir: 'salas' }],
    ['/configuracion?tab=servicios-cita', { tab: 'clases', ancla: 'servicios-de-cita' }],
    ['/configuracion?tab=horario-citas', { tab: 'clases', ancla: 'horario-de-citas' }],
    ['/configuracion?tab=crecimiento-web', { tab: 'web', abrir: 'widgets' }],
    ['/configuracion?tab=campos-de-cliente', { tab: 'altas', ancla: 'datos-extra-de-la-ficha' }],
    ['/configuracion?tab=emails', { tab: 'comunicacion', abrir: 'correos-automaticos' }],
    // Las herramientas con pantalla propia (15-sep, v2): `abrir=` y las anclas de
    // las tarjetas que se fueron a ellas.
    ['/configuracion?tab=web&abrir=widgets', { tab: 'web', abrir: 'widgets' }],
    ['/configuracion?abrir=salas', { tab: 'estudio', abrir: 'salas' }],
    ['/configuracion?tab=clases&abrir=salas', { tab: 'estudio', abrir: 'salas' }],
    ['/configuracion?tab=web&abrir=inventada', { tab: 'web' }],
    ['/configuracion?tab=web#widgets', { tab: 'web', abrir: 'widgets' }],
    ['/configuracion?tab=estudio#salas', { tab: 'estudio', abrir: 'salas' }],
    ['/configuracion?tab=clases#tipos-de-clase', { tab: 'clases', abrir: 'tipos-de-clase' }],
    ['/configuracion?tab=comunicacion#correos-automaticos', { tab: 'comunicacion', abrir: 'correos-automaticos' }],
    ['/configuracion?tab=web#contenido-de-tu-app', { tab: 'web', abrir: 'contenido-de-tu-app' }],
    ['/configuracion#canjes', { tab: 'motivacion', abrir: 'recompensas-y-logros', ancla: 'canjes' }],
    ['/configuracion?tab=motivacion&abrir=recompensas-y-logros#retos', { tab: 'motivacion', abrir: 'recompensas-y-logros', ancla: 'retos' }],
    ['/configuracion?tab=web&abrir=widgets#no-es-una-tarjeta', { tab: 'web', abrir: 'widgets', ancla: 'no-es-una-tarjeta' }],
    // Un ancla de la sección cierra la herramienta: se ve la tarjeta que se pide.
    ['/configuracion?tab=web&abrir=widgets#network', { tab: 'web', ancla: 'network' }],
    // Las reglas de los créditos se quedan en la sección.
    ['/configuracion?tab=motivacion#reglas', { tab: 'motivacion', ancla: 'reglas' }],
    ['/configuracion?tab=copias-de-seguridad', { tab: 'datos', ancla: 'exportar' }],
    ['/configuracion?tab=salud', { tab: 'altas', ancla: 'cuestionario-de-salud' }],
    ['/configuracion?tab=cuestionario', { tab: 'altas', ancla: 'cuestionario-de-salud' }],
    // Las anclas de hoy mandan, venga el `tab=` que venga.
    ['/configuracion?tab=estudio&sub=reservas#ajuste-avisar-alumnas', { tab: 'reservas', ancla: 'ajuste-avisar-alumnas' }],
    ['/configuracion?tab=cobros#datos-fiscales', { tab: 'cobros', ancla: 'datos-fiscales' }],
    ['/configuracion?tab=estudio#datos-fiscales', { tab: 'cobros', ancla: 'datos-fiscales' }],
    // Las dos que vivían dentro de las reglas de reserva, ya en su sección: sus
    // enlaces viejos las siguen.
    ['/configuracion?tab=altas#compra-desde-tu-enlace', { tab: 'altas', ancla: 'compra-desde-tu-enlace' }],
    ['/configuracion?tab=reservas#compra-desde-tu-enlace', { tab: 'altas', ancla: 'compra-desde-tu-enlace' }],
    ['/configuracion?tab=estudio&sub=reservas#compra-desde-tu-enlace', { tab: 'altas', ancla: 'compra-desde-tu-enlace' }],
    ['/configuracion?tab=equipo#ajuste-instructoras-crean-clases', { tab: 'equipo', ancla: 'ajuste-instructoras-crean-clases' }],
    ['/configuracion?tab=reservas#ajuste-instructoras-crean-clases', { tab: 'equipo', ancla: 'ajuste-instructoras-crean-clases' }],
    ['/configuracion?tab=estudio&sub=reservas#ajuste-instructoras-crean-clases', { tab: 'equipo', ancla: 'ajuste-instructoras-crean-clases' }],
    // La tarjeta única de reglas se partió en cinco: su ancla lleva a la primera.
    ['/configuracion?tab=reservas#reglas-de-reserva', { tab: 'reservas', ancla: 'reservar' }],
    ['/configuracion#reglas-de-reserva', { tab: 'reservas', ancla: 'reservar' }],
    ['/configuracion?tab=reservas#asistencia', { tab: 'reservas', ancla: 'asistencia' }],
    ['/configuracion?tab=estudio#lista-de-espera', { tab: 'reservas', ancla: 'lista-de-espera' }],
    // Los ajustes sueltos de dentro llevan a la fila cuyo cajón los tiene (15-sep, v2).
    ['/configuracion?tab=reservas#ajuste-ventana-cancelacion', { tab: 'reservas', ancla: 'cancelar-y-recuperar' }],
    ['/configuracion?tab=reservas#ajuste-lista-espera', { tab: 'reservas', ancla: 'lista-de-espera' }],
    ['/configuracion?tab=reservas#ajuste-clase-devuelve-bono', { tab: 'reservas', ancla: 'si-se-cancela-una-clase' }],
    ['/configuracion?tab=reservas#politica-explicada', { tab: 'reservas', ancla: 'cancelar-y-recuperar' }],
    // Lo desconocido no rompe: abre la lista.
    ['/configuracion', { tab: null }],
    ['/configuracion?tab=inventada', { tab: null }],
    ['/configuracion?tab=inventada#no-existe', { tab: null }],
    ['/configuracion?tab=estudio&sub=inventada', { tab: 'estudio' }],
    ['/configuracion?tab=citas#no-es-un-id%22', { tab: 'clases', ancla: 'servicios-de-cita' }],
  ];
  for (const [href, esperado] of casos) {
    assert.deepEqual(resolverHref(href), esperado, href);
  }
});

test('las doce pestañas de antes y todas sus sub-pestañas tienen sitio hoy', () => {
  // Lo que había hasta el 15-sep, copiado tal cual: es historia, no se toca.
  const antes: Record<string, readonly string[]> = {
    'clases-salas': ['clases', 'salas'],
    citas: ['servicios', 'horario'],
    gamificacion: ['recompensas', 'canjes', 'logros', 'niveles', 'retos'],
    integraciones: [],
    estudio: ['general', 'sedes', 'horario', 'reservas', 'cobros', 'enlaces', 'legal'],
    descubre: [],
    api: ['widgets', 'crecimiento'],
    campos: [],
    'cuestionario-salud': [],
    plantillas: [],
    backups: [],
    perfil: [],
  };
  for (const [tab, subs] of Object.entries(antes)) {
    assert.ok(reconoceTab(tab), `«${tab}» ya no lleva a ningún sitio`);
    const destino = resolverHref(`/configuracion?tab=${tab}`);
    assert.ok('redirect' in destino || destino.tab !== null, `«${tab}» abre la lista en vez de su sitio`);
    for (const sub of subs) assert.ok(reconoceSub(tab, sub), `«${tab}&sub=${sub}» se pierde`);
  }
});

test('los parámetros de conexión mandan sobre un tab= distinto, y el ancla conocida también', () => {
  assert.deepEqual(resolverDestino({ tab: 'estudio', params: { stripe_connected: '1' } }), { tab: 'cobros', ancla: 'integracion-stripe' });
  assert.deepEqual(resolverDestino({ tab: 'clases', hash: '#canjes' }), { tab: 'motivacion', abrir: 'recompensas-y-logros', ancla: 'canjes' });
  // Una herramienta abre su sección, con cualquier otro `tab=`.
  assert.deepEqual(resolverDestino({ tab: 'cobros', params: { abrir: 'widgets' } }), { tab: 'web', abrir: 'widgets' });
  assert.deepEqual(resolverDestino({ tab: 'cobros', hash: 'otra-cosa' }), { tab: 'cobros', ancla: 'otra-cosa' });
});

test('las anclas salen solas de secciones.ts, con la sección de cada tarjeta', () => {
  const tarjetas = SECCIONES.flatMap(s => s.tarjetas.map(t => t.id));
  assert.deepEqual(Object.keys(ANCLAS).sort(), [...tarjetas].sort());
  for (const id of tarjetas) {
    assert.equal(ANCLAS[id], seccionDeTarjeta(id));
    assert.ok(esAnclaConocida(id));
  }
  assert.equal(ANCLAS['datos-fiscales'], 'cobros');
  assert.equal(ANCLAS['compra-desde-tu-enlace'], 'altas');
  assert.equal(ANCLAS['ajuste-instructoras-crean-clases'], 'equipo');
  // Una tarjeta retirada no es de ninguna sección, pero su ancla se sigue entendiendo.
  assert.equal(Object.hasOwn(ANCLAS, 'reglas-de-reserva'), false);
  assert.ok(esAnclaConocida('reglas-de-reserva'));
});

test('la URL que escribe la página vuelve a abrir lo mismo', () => {
  for (const s of SECCIONES) {
    assert.deepEqual(resolverHref(hrefDeSeccion(s.id)), { tab: s.id });
    for (const t of s.tarjetas) {
      assert.deepEqual(resolverHref(hrefDeTarjeta(t.id)), lugarDeTarjeta(t.id));
      // Una tarjeta de una herramienta abre la herramienta, no su sección.
      const h = herramientaDeTarjeta(t.id);
      assert.equal(lugarDeTarjeta(t.id).abrir, h ?? undefined, t.id);
      if (!h) assert.deepEqual(resolverHref(hrefDeSeccion(s.id, t.id)), { tab: s.id, ancla: t.id });
    }
  }
  for (const h of HERRAMIENTAS) {
    assert.deepEqual(resolverHref(hrefDeHerramienta(h.id)), { tab: h.seccion, abrir: h.id });
    assert.equal(hrefDeHerramienta(h.id), `/configuracion?tab=${h.seccion}&abrir=${h.id}`);
  }
});

test('las pantallas sueltas de antes llevan a su sección, y sus páginas redirigen con eso', () => {
  assert.deepEqual(resolverHref(RUTAS_ANTIGUAS['/configuracion/notificaciones']), { tab: 'avisos' });
  assert.deepEqual(resolverHref(RUTAS_ANTIGUAS['/configuracion/apariencia/panel']), { tab: 'panel' });
  for (const ruta of Object.keys(RUTAS_ANTIGUAS)) {
    const pagina = readFileSync(join(RAIZ, 'app/(dashboard)', ruta, 'page.tsx'), 'utf8');
    assert.ok(pagina.includes(`redirect(RUTAS_ANTIGUAS['${ruta}'])`), `${ruta}: la página no redirige a su sección`);
  }
});

test('la propietaria ve las catorce secciones; la gerencia, dos y solo con sus tarjetas; recepción e instructora, ninguna', () => {
  assert.equal(seccionesVisibles('PROPIETARIO').length, 14);
  assert.deepEqual(seccionesVisibles('RECEPCION'), []);
  assert.deepEqual(seccionesVisibles('INSTRUCTOR'), []);

  // La gerencia abre «Mi estudio» y «Mis clases y citas», pero dentro solo lo
  // que lleva de su sede: ni el nombre del estudio, ni las sedes, ni los
  // servicios de cita (que llevan precio).
  const gerencia = seccionesVisibles('MANAGER');
  assert.deepEqual(gerencia.map(s => s.id), ['estudio', 'clases']);
  assert.deepEqual(gerencia[0].tarjetas.map(t => t.id), ['horario', 'cerrar-el-centro', 'salas']);
  assert.deepEqual(gerencia[1].tarjetas.map(t => t.id), ['tipos-de-clase', 'horario-de-citas']);
  // Y a la propietaria no se le recorta ninguna.
  for (const s of seccionesVisibles('PROPIETARIO')) {
    assert.equal(s.tarjetas.length, seccionPorId(s.id).tarjetas.length, s.id);
  }
});

test('un enlace a Configuración solo se ofrece a quien puede abrirlo de verdad', () => {
  // La propietaria, todo.
  for (const href of ['/configuracion', '/configuracion?tab=cobros#datos-fiscales', '/configuracion?tab=estudio&abrir=salas']) {
    assert.equal(puedeAbrirEnConfiguracion('PROPIETARIO', href), true, href);
  }
  // La gerencia: lo suyo sí.
  assert.equal(puedeAbrirEnConfiguracion('MANAGER', '/configuracion'), true);
  assert.equal(puedeAbrirEnConfiguracion('MANAGER', '/configuracion?tab=estudio&abrir=salas'), true);
  assert.equal(puedeAbrirEnConfiguracion('MANAGER', '/configuracion?tab=estudio#horario'), true);
  assert.equal(puedeAbrirEnConfiguracion('MANAGER', '/configuracion?tab=clases&abrir=tipos-de-clase'), true);
  // Una sección que no abre, una tarjeta que no ve dentro de una que sí, y una
  // herramienta ajena: las tres, no.
  assert.equal(puedeAbrirEnConfiguracion('MANAGER', '/configuracion?tab=cobros#datos-fiscales'), false);
  assert.equal(puedeAbrirEnConfiguracion('MANAGER', '/configuracion?tab=estudio#contacto'), false);
  assert.equal(puedeAbrirEnConfiguracion('MANAGER', '/configuracion?tab=web&abrir=widgets'), false);
  // Recepción no abre ni el inicio.
  assert.equal(puedeAbrirEnConfiguracion('RECEPCION', '/configuracion'), false);
  // Lo que no es Configuración no se juzga aquí (lo decide `puedeVer`), y un
  // `?tab=` que lleva fuera tampoco: `?tab=planes` redirige a /productos.
  assert.equal(puedeAbrirEnConfiguracion('MANAGER', '/calendario'), true);
  assert.equal(puedeAbrirEnConfiguracion('MANAGER', '/configuracion?tab=planes'), true);
});

// ─── 2. Los ids de aquí son los que se pintan ───────────────────────────────

function fuentes(dir: string): string[] {
  return (readdirSync(join(RAIZ, dir), { recursive: true }) as string[])
    .map(r => join(dir, r))
    .filter(r => /\.tsx?$/.test(r) && statSync(join(RAIZ, r)).isFile());
}

const COMPONENTES = fuentes('components/configuracion')
  .map(f => ({ f, codigo: readFileSync(join(RAIZ, f), 'utf8') }));

test('cada sección tiene su componente y el shell lo carga', () => {
  const shell = readFileSync(join(RAIZ, 'components/configuracion/shell/config-shell.tsx'), 'utf8');
  for (const s of SECCIONES) {
    const fichero = `components/configuracion/secciones/seccion-${s.id}.tsx`;
    assert.ok(existsSync(join(RAIZ, fichero)), `falta ${fichero}`);
    assert.match(shell, new RegExp(`secciones/seccion-${s.id}'`), `el shell no carga «${s.id}»`);
  }
  // Y cada herramienta, su pantalla; y en su sección, su fila.
  for (const h of HERRAMIENTAS) {
    const fichero = `components/configuracion/herramientas/herramienta-${h.id}.tsx`;
    assert.ok(existsSync(join(RAIZ, fichero)), `falta ${fichero}`);
    assert.match(shell, new RegExp(`herramientas/herramienta-${h.id}'`), `el shell no carga «${h.id}»`);
    const seccion = readFileSync(join(RAIZ, `components/configuracion/secciones/seccion-${h.seccion}.tsx`), 'utf8');
    assert.match(seccion, new RegExp(`id: '${h.id}'`), `«${h.seccion}» no pinta la fila de «${h.id}»`);
  }
});

test('cada tarjeta de secciones.ts existe de verdad como id en un componente', () => {
  const faltan: string[] = [];
  for (const s of SECCIONES) {
    for (const { id } of s.tarjetas) {
      const encontrada = COMPONENTES.some(c => c.codigo.includes(`id="${id}"`) || c.codigo.includes(`id: '${id}'`));
      if (!encontrada) faltan.push(`${s.id}#${id}`);
    }
  }
  assert.deepEqual(faltan, [], 'tarjetas sin ningún elemento con ese id');
});

test('cada integración tiene su fila en la sección de su tarjeta, y solo en esa', () => {
  // Desde el 15-sep (v2) no hay catálogo de tarjetas de integraciones: cada una
  // es una fila con UN estado. Stripe en Cobros, el remitente, WhatsApp y Gmail
  // en Cómo me comunico, y el resto en Conexiones. Si una sección la pintara y
  // otra la tuviera en secciones.ts, su ancla, «Revisa esto» y la vuelta de su
  // conexión llevarían a una sección donde no está.
  assert.ok(!existsSync(join(RAIZ, 'components/configuracion/tab-integraciones.tsx')), 'vuelve a haber un catálogo de tarjetas de integraciones');
  const FICHEROS: Partial<Record<SeccionId, string[]>> = {
    cobros: ['secciones/seccion-cobros.tsx', 'cobro-con-tarjeta.tsx'],
    comunicacion: ['secciones/seccion-comunicacion.tsx', 'canales-comunicacion.tsx'],
    conexiones: ['secciones/seccion-conexiones.tsx', 'conexiones.tsx'],
  };
  const leer = (s: SeccionId) => (FICHEROS[s] ?? []).map(f => readFileSync(join(RAIZ, 'components/configuracion', f), 'utf8')).join('\n');
  const tieneFila = (codigo: string, id: string) => codigo.includes(`id="${id}"`) || codigo.includes(`id: '${id}'`);

  for (const [tipo, tarjeta] of Object.entries(TARJETA_DE_INTEGRACION)) {
    assert.ok(esAnclaConocida(tarjeta), `«${tipo}» no tiene tarjeta en secciones.ts`);
    const suya = seccionDeTarjeta(tarjeta);
    assert.ok(FICHEROS[suya], `«${tipo}» está en «${suya}», que no tiene filas de conexiones`);
    assert.ok(tieneFila(leer(suya), tarjeta), `«${tipo}»: «${suya}» no pinta la fila #${tarjeta}`);
    for (const otra of Object.keys(FICHEROS) as SeccionId[]) {
      if (otra !== suya) assert.ok(!tieneFila(leer(otra), tarjeta), `«${tipo}» también se pinta en «${otra}»`);
    }
  }
});

// ─── 3. Barrido del repo ────────────────────────────────────────────────────

const DIRECTORIOS = ['app', 'components', 'lib', 'e2e'];
// El propio resolutor escribe plantillas (`?tab=${tab}`) y este test casos rotos a propósito.
const EXCLUIDOS = new Set(['lib/configuracion/destino.ts', 'lib/configuracion/destino.test.ts']);

function paginaExiste(ruta: string): boolean {
  return [join(RAIZ, 'app/(dashboard)', ruta, 'page.tsx'), join(RAIZ, 'app', ruta, 'page.tsx')].some(existsSync);
}

test('⚠️ todo `/configuracion?…` del repo llega a una sección y a una tarjeta que existen', () => {
  const rotos: string[] = [];
  let vistos = 0;
  for (const f of DIRECTORIOS.flatMap(fuentes).filter(f => !EXCLUIDOS.has(f))) {
    readFileSync(join(RAIZ, f), 'utf8').split('\n').forEach((linea, i) => {
      for (const [bruto] of linea.matchAll(/\/configuracion\?[^'"`\s<>)\]]*/g)) {
        vistos++;
        // Las partes interpoladas (`&${query}`, `sub=${sub}`) no se pueden
        // resolver aquí: se quitan y se comprueba lo que está escrito a mano.
        const href = bruto
          .replace(/[\w-]+=\$\{[^}]*\}?/g, '')
          .replace(/\$\{[^}]*\}?/g, '')
          .replace(/&{2,}/g, '&')
          .replace(/[?&]+$/, '');
        const url = new URL(href, 'https://tentare.invalid');
        const destino = resolverHref(href);
        const donde = `${relative(RAIZ, join(RAIZ, f))}:${i + 1} ${href}`;
        if ('redirect' in destino) {
          if (!paginaExiste(destino.redirect.split('?')[0])) rotos.push(`${donde} → redirige a una página que no existe`);
          continue;
        }
        const tab = url.searchParams.get('tab');
        const sub = url.searchParams.get('sub');
        const abrir = url.searchParams.get('abrir');
        if (tab !== null && !reconoceTab(tab)) rotos.push(`${donde} → «${tab}» no es ninguna sección`);
        if (tab !== null && sub && !reconoceSub(tab, sub)) rotos.push(`${donde} → la sub-pestaña «${sub}» se pierde`);
        if (abrir !== null && !esHerramientaId(abrir)) rotos.push(`${donde} → «${abrir}» no es ninguna herramienta`);
        // Un ancla que ES una herramienta (`#widgets`) abre su pantalla: no se pierde.
        if (url.hash && !destino.ancla && !destino.abrir) rotos.push(`${donde} → el ancla se pierde`);
        if (destino.ancla && url.hash && !esAnclaConocida(destino.ancla) && !/^ajuste-/.test(destino.ancla)) {
          rotos.push(`${donde} → «#${destino.ancla}» no es ninguna tarjeta`);
        }
        if (destino.ancla && esAnclaConocida(destino.ancla) && Object.hasOwn(ANCLAS, destino.ancla)
          && seccionDeTarjeta(destino.ancla as TarjetaId) !== destino.tab) {
          rotos.push(`${donde} → «#${destino.ancla}» no se pinta en «${destino.tab}»`);
        }
      }
    });
  }
  // Verde por vacío no: si el patrón deja de casar, esto tiene que gritar.
  assert.ok(vistos > 40, `solo se han encontrado ${vistos} enlaces a /configuracion?`);
  assert.deepEqual(rotos, [], `\n${rotos.join('\n')}\n`);
});
