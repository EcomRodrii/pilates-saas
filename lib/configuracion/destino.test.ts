import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  ANCLAS, esAnclaConocida, hrefDeSeccion, reconoceSub, reconoceTab, resolverDestino, resolverHref,
  seccionesVisibles,
} from './destino.ts';
import { SECCIONES, seccionAnfitriona, tarjetasDeFuera, type SeccionId, type TarjetaId } from './secciones.ts';

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
    ['/configuracion?tab=gamificacion&sub=canjes', { tab: 'motivacion', ancla: 'canjes' }],
    ['/configuracion?tab=clases-salas&sub=salas', { tab: 'estudio', ancla: 'salas' }],
    ['/configuracion?tab=estudio&sub=salas', { tab: 'estudio', ancla: 'salas' }],
    ['/configuracion?tab=estudio&sub=general#datos-fiscales', { tab: 'estudio', ancla: 'datos-fiscales' }],
    // Las vueltas de una conexión, sin `tab=` o con uno viejo.
    ['/configuracion?stripe_connected=1', { tab: 'conexiones', ancla: 'integracion-stripe' }],
    ['/configuracion?stripe_connect_error=Stripe%20no%20configurado', { tab: 'conexiones', ancla: 'integracion-stripe' }],
    ['/configuracion?gmail_connected=1', { tab: 'conexiones', ancla: 'integracion-gmail' }],
    ['/configuracion?gmail_error=x', { tab: 'conexiones', ancla: 'integracion-gmail' }],
    ['/configuracion?google_calendar_connected=1', { tab: 'conexiones', ancla: 'integracion-google_calendar' }],
    ['/configuracion?google_calendar_error=x', { tab: 'conexiones', ancla: 'integracion-google_calendar' }],
    ['/configuracion?zoom_connected=1', { tab: 'conexiones', ancla: 'integracion-zoom' }],
    ['/configuracion?zoom_error=x', { tab: 'conexiones', ancla: 'integracion-zoom' }],
    ['/configuracion?klaviyo_connected=1', { tab: 'conexiones', ancla: 'mas-integraciones' }],
    ['/configuracion?klaviyo_error=x', { tab: 'conexiones', ancla: 'mas-integraciones' }],
    ['/configuracion?whatsapp_connected=1', { tab: 'conexiones', ancla: 'integracion-whatsapp' }],
    ['/configuracion?tab=integraciones&stripe_connected=1', { tab: 'conexiones', ancla: 'integracion-stripe' }],
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
    ['/configuracion?tab=descubre', { tab: 'web', ancla: 'contenido-de-tu-app' }],
    ['/configuracion?tab=api', { tab: 'web', ancla: 'widgets' }],
    ['/configuracion?tab=campos', { tab: 'altas', ancla: 'datos-extra-de-la-ficha' }],
    ['/configuracion?tab=cuestionario-salud', { tab: 'altas', ancla: 'cuestionario-de-salud' }],
    ['/configuracion?tab=plantillas', { tab: 'comunicacion', ancla: 'correos-automaticos' }],
    ['/configuracion?tab=backups', { tab: 'datos', ancla: 'exportar' }],
    // Sus sub-pestañas.
    ['/configuracion?tab=clases-salas&sub=clases', { tab: 'clases', ancla: 'tipos-de-clase' }],
    ['/configuracion?tab=citas&sub=servicios', { tab: 'clases', ancla: 'servicios-de-cita' }],
    ['/configuracion?tab=citas&sub=horario', { tab: 'clases', ancla: 'horario-de-citas' }],
    ['/configuracion?tab=gamificacion&sub=recompensas', { tab: 'motivacion', ancla: 'recompensas' }],
    ['/configuracion?tab=gamificacion&sub=logros', { tab: 'motivacion', ancla: 'logros' }],
    ['/configuracion?tab=gamificacion&sub=niveles', { tab: 'motivacion', ancla: 'niveles' }],
    ['/configuracion?tab=gamificacion&sub=retos', { tab: 'motivacion', ancla: 'retos' }],
    ['/configuracion?tab=estudio&sub=general', { tab: 'estudio' }],
    ['/configuracion?tab=estudio&sub=sedes', { tab: 'estudio', ancla: 'sedes' }],
    ['/configuracion?tab=estudio&sub=horario', { tab: 'estudio', ancla: 'horario-y-cierres' }],
    ['/configuracion?tab=estudio&sub=reservas', { tab: 'reservas' }],
    ['/configuracion?tab=estudio&sub=cobros', { tab: 'cobros' }],
    ['/configuracion?tab=estudio&sub=enlaces', { tab: 'web', ancla: 'direccion-y-enlaces' }],
    ['/configuracion?tab=estudio&sub=legal', { tab: 'altas', ancla: 'contrato-y-privacidad' }],
    ['/configuracion?tab=api&sub=widgets', { tab: 'web', ancla: 'widgets' }],
    ['/configuracion?tab=api&sub=crecimiento', { tab: 'web', ancla: 'widgets' }],
    // Los alias que ya existían.
    ['/configuracion?tab=recompensas', { tab: 'motivacion', ancla: 'recompensas' }],
    ['/configuracion?tab=canjes', { tab: 'motivacion', ancla: 'canjes' }],
    ['/configuracion?tab=logros', { tab: 'motivacion', ancla: 'logros' }],
    ['/configuracion?tab=niveles', { tab: 'motivacion', ancla: 'niveles' }],
    ['/configuracion?tab=retos', { tab: 'motivacion', ancla: 'retos' }],
    ['/configuracion?tab=clases', { tab: 'clases' }],
    ['/configuracion?tab=salas', { tab: 'estudio', ancla: 'salas' }],
    ['/configuracion?tab=servicios-cita', { tab: 'clases', ancla: 'servicios-de-cita' }],
    ['/configuracion?tab=horario-citas', { tab: 'clases', ancla: 'horario-de-citas' }],
    ['/configuracion?tab=crecimiento-web', { tab: 'web', ancla: 'widgets' }],
    ['/configuracion?tab=campos-de-cliente', { tab: 'altas', ancla: 'datos-extra-de-la-ficha' }],
    ['/configuracion?tab=emails', { tab: 'comunicacion', ancla: 'correos-automaticos' }],
    ['/configuracion?tab=copias-de-seguridad', { tab: 'datos', ancla: 'exportar' }],
    ['/configuracion?tab=salud', { tab: 'altas', ancla: 'cuestionario-de-salud' }],
    ['/configuracion?tab=cuestionario', { tab: 'altas', ancla: 'cuestionario-de-salud' }],
    // Las anclas de hoy mandan, venga el `tab=` que venga.
    ['/configuracion?tab=estudio&sub=reservas#ajuste-avisar-alumnas', { tab: 'reservas', ancla: 'ajuste-avisar-alumnas' }],
    ['/configuracion?tab=cobros#datos-fiscales', { tab: 'estudio', ancla: 'datos-fiscales' }],
    ['/configuracion?tab=reservas#ajuste-ventana-cancelacion', { tab: 'reservas', ancla: 'ajuste-ventana-cancelacion' }],
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
  assert.deepEqual(resolverDestino({ tab: 'estudio', params: { stripe_connected: '1' } }), { tab: 'conexiones', ancla: 'integracion-stripe' });
  assert.deepEqual(resolverDestino({ tab: 'clases', hash: '#canjes' }), { tab: 'motivacion', ancla: 'canjes' });
  assert.deepEqual(resolverDestino({ tab: 'cobros', hash: 'otra-cosa' }), { tab: 'cobros', ancla: 'otra-cosa' });
});

test('las anclas salen solas de secciones.ts, con la sección donde se pinta HOY la tarjeta', () => {
  const tarjetas = SECCIONES.flatMap(s => s.tarjetas.map(t => t.id));
  assert.deepEqual(Object.keys(ANCLAS).sort(), [...tarjetas].sort());
  for (const id of tarjetas) {
    assert.equal(ANCLAS[id], seccionAnfitriona(id));
    assert.ok(esAnclaConocida(id));
  }
  // Hospedada: su casa definitiva es Cobros, pero hoy se pinta en Mi estudio.
  assert.equal(ANCLAS['datos-fiscales'], 'estudio');
});

test('la URL que escribe la página vuelve a abrir lo mismo', () => {
  for (const s of SECCIONES) {
    assert.deepEqual(resolverHref(hrefDeSeccion(s.id)), { tab: s.id });
    for (const t of s.tarjetas) {
      const anfitriona = seccionAnfitriona(t.id);
      assert.deepEqual(resolverHref(hrefDeSeccion(anfitriona, t.id)), { tab: anfitriona, ancla: t.id });
    }
  }
});

test('la propietaria ve las once secciones y el resto de roles ninguna', () => {
  assert.equal(seccionesVisibles('PROPIETARIO').length, 11);
  assert.deepEqual(seccionesVisibles('RECEPCION'), []);
  assert.deepEqual(seccionesVisibles('INSTRUCTOR'), []);
});

// ─── 2. Los ids de aquí son los que se pintan ───────────────────────────────

function fuentes(dir: string): string[] {
  return (readdirSync(join(RAIZ, dir), { recursive: true }) as string[])
    .map(r => join(dir, r))
    .filter(r => /\.tsx?$/.test(r) && statSync(join(RAIZ, r)).isFile());
}

// Sin las filas `<TarjetaEnlace id="…">`: una fila que apunta a una tarjeta no
// es la tarjeta, y contarla dejaría pasar un id que no se pinta en ningún sitio.
const COMPONENTES = fuentes('components/configuracion')
  .map(f => ({ f, codigo: readFileSync(join(RAIZ, f), 'utf8').replace(/<TarjetaEnlace id="[^"]*"/g, '') }));

test('cada sección tiene su componente y el shell lo carga', () => {
  const shell = readFileSync(join(RAIZ, 'components/configuracion/shell/config-shell.tsx'), 'utf8');
  for (const s of SECCIONES) {
    const fichero = `components/configuracion/secciones/seccion-${s.id}.tsx`;
    assert.ok(existsSync(join(RAIZ, fichero)), `falta ${fichero}`);
    assert.match(shell, new RegExp(`secciones/seccion-${s.id}'`), `el shell no carga «${s.id}»`);
  }
});

test('cada tarjeta de secciones.ts existe de verdad como id en un componente', () => {
  const faltan: string[] = [];
  for (const s of SECCIONES) {
    for (const { id } of s.tarjetas) {
      const integracion = /^integracion-(.+)$/.exec(id);
      const encontrada = integracion
        // Las integraciones calculan su id del catálogo: `integracion-${tipo}`.
        ? COMPONENTES.some(c => c.f.endsWith('tab-integraciones.tsx')
          && c.codigo.includes(`tipo: '${integracion[1].toUpperCase()}'`)
          && c.codigo.includes('`integracion-${'))
        : COMPONENTES.some(c => c.codigo.includes(`id="${id}"`) || c.codigo.includes(`id: '${id}'`));
      if (!encontrada) faltan.push(`${s.id}#${id}`);
    }
  }
  assert.deepEqual(faltan, [], 'tarjetas sin ningún elemento con ese id');
});

test('cada sección enseña una fila hacia cada tarjeta suya que se pinta en otra', () => {
  for (const s of SECCIONES) {
    const codigo = readFileSync(join(RAIZ, `components/configuracion/secciones/seccion-${s.id}.tsx`), 'utf8');
    const filas = [...codigo.matchAll(/<TarjetaEnlace id="([^"]+)"/g)].map(m => m[1]).sort();
    const esperadas = tarjetasDeFuera(s.id as SeccionId).map(t => t.id).sort();
    assert.deepEqual(filas, esperadas, `filas de «${s.id}»`);
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
        if (tab !== null && !reconoceTab(tab)) rotos.push(`${donde} → «${tab}» no es ninguna sección`);
        if (tab !== null && sub && !reconoceSub(tab, sub)) rotos.push(`${donde} → la sub-pestaña «${sub}» se pierde`);
        if (url.hash && !destino.ancla) rotos.push(`${donde} → el ancla se pierde`);
        if (destino.ancla && url.hash && !esAnclaConocida(destino.ancla) && !/^ajuste-/.test(destino.ancla)) {
          rotos.push(`${donde} → «#${destino.ancla}» no es ninguna tarjeta`);
        }
        if (destino.ancla && esAnclaConocida(destino.ancla)
          && seccionAnfitriona(destino.ancla as TarjetaId) !== destino.tab) {
          rotos.push(`${donde} → «#${destino.ancla}» no se pinta en «${destino.tab}»`);
        }
      }
    });
  }
  // Verde por vacío no: si el patrón deja de casar, esto tiene que gritar.
  assert.ok(vistos > 40, `solo se han encontrado ${vistos} enlaces a /configuracion?`);
  assert.deepEqual(rotos, [], `\n${rotos.join('\n')}\n`);
});
