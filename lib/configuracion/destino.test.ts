import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  SECCIONES_CONFIGURACION, TAB_POR_DEFECTO, hrefDeSeccion, reconoceTab, resolverDestino, resolverHref,
  type TabConfiguracion,
} from './destino.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Los enlaces a Configuración aterrizan donde dicen.
//
// Tres cosas, de más concreta a más general:
//   1. la tabla de casos: cada enlace viejo o roto que se encontró al auditar;
//   2. que los ids de aquí son los que la página y sus pestañas pintan de
//      verdad (si alguien añade una sub-pestaña y no la apunta aquí, ningún
//      enlace podría llevar a ella);
//   3. un barrido del repo: todo `/configuracion?…` escrito a mano tiene que
//      llegar a una pestaña y sub-pestaña que existan. Es el mismo tipo de
//      fallo que `sub=canjes` abriendo Recompensas: no rompe nada, solo manda
//      a otro sitio.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..', '..');

test('tabla: cada enlace llega a su pestaña y sub-pestaña', () => {
  const casos: [string, ReturnType<typeof resolverHref>][] = [
    // Los que aterrizaban mal (auditoría del 15-sep).
    ['/configuracion?tab=gamificacion&sub=canjes', { tab: 'gamificacion', sub: 'canjes' }],
    ['/configuracion?tab=clases-salas&sub=salas', { tab: 'clases-salas', sub: 'salas' }],
    ['/configuracion?tab=estudio&sub=salas', { tab: 'clases-salas', sub: 'salas' }],
    ['/configuracion?tab=estudio&sub=general#datos-fiscales', { tab: 'estudio', sub: 'general', ancla: 'datos-fiscales' }],
    ['/configuracion?stripe_connected=1', { tab: 'integraciones' }],
    ['/configuracion?stripe_connect_error=Stripe%20no%20configurado', { tab: 'integraciones' }],
    ['/configuracion?gmail_connected=1', { tab: 'integraciones' }],
    ['/configuracion?google_calendar_error=x', { tab: 'integraciones' }],
    ['/configuracion?zoom_connected=1', { tab: 'integraciones' }],
    ['/configuracion?klaviyo_error=x', { tab: 'integraciones' }],
    ['/configuracion?whatsapp_connected=1', { tab: 'integraciones' }],
    ['/configuracion?tab=integraciones&stripe_connected=1', { tab: 'integraciones' }],
    ['/configuracion?suscripcion=ok', { redirect: '/suscripcion?suscripcion=ok' }],
    ['/configuracion?suscripcion=cancel', { redirect: '/suscripcion?suscripcion=cancel' }],
    // Los alias que ya existían en page.tsx.
    ['/configuracion?tab=planes', { redirect: '/productos' }],
    ['/configuracion?tab=recompensas', { tab: 'gamificacion', sub: 'recompensas' }],
    ['/configuracion?tab=retos', { tab: 'gamificacion', sub: 'retos' }],
    ['/configuracion?tab=clases', { tab: 'clases-salas', sub: 'clases' }],
    ['/configuracion?tab=salas', { tab: 'clases-salas', sub: 'salas' }],
    ['/configuracion?tab=servicios-cita', { tab: 'citas', sub: 'servicios' }],
    ['/configuracion?tab=horario-citas', { tab: 'citas', sub: 'horario' }],
    ['/configuracion?tab=emails', { tab: 'plantillas' }],
    ['/configuracion?tab=mi-perfil', { tab: 'perfil' }],
    ['/configuracion?tab=campos-de-cliente', { tab: 'campos' }],
    ['/configuracion?tab=copias-de-seguridad', { tab: 'backups' }],
    ['/configuracion?tab=salud', { tab: 'cuestionario-salud' }],
    ['/configuracion?tab=crecimiento-web', { tab: 'api', sub: 'crecimiento' }],
    // Pestañas de hoy con sub-pestaña.
    ['/configuracion?tab=citas&sub=horario', { tab: 'citas', sub: 'horario' }],
    ['/configuracion?tab=estudio&sub=reservas', { tab: 'estudio', sub: 'reservas' }],
    ['/configuracion?tab=api&sub=crecimiento', { tab: 'api', sub: 'crecimiento' }],
    // Lo desconocido no rompe: cae a lo de por defecto.
    ['/configuracion', { tab: TAB_POR_DEFECTO }],
    ['/configuracion?tab=inventada', { tab: TAB_POR_DEFECTO }],
    ['/configuracion?tab=estudio&sub=inventada', { tab: 'estudio' }],
    ['/configuracion?tab=citas#no-es-un-id%22', { tab: 'citas' }],
  ];
  for (const [href, esperado] of casos) {
    assert.deepEqual(resolverHref(href), esperado, href);
  }
});

test('los parámetros de conexión mandan sobre un tab= distinto, y el ancla conocida también', () => {
  assert.deepEqual(resolverDestino({ tab: 'estudio', params: { stripe_connected: '1' } }), { tab: 'integraciones' });
  assert.deepEqual(resolverDestino({ tab: 'citas', hash: '#datos-fiscales' }), { tab: 'estudio', sub: 'general', ancla: 'datos-fiscales' });
  assert.deepEqual(resolverDestino({ tab: 'estudio', sub: 'cobros', hash: 'otra-cosa' }), { tab: 'estudio', sub: 'cobros', ancla: 'otra-cosa' });
});

test('la URL que escribe la página vuelve a abrir lo mismo', () => {
  for (const [tab, subs] of Object.entries(SECCIONES_CONFIGURACION) as [TabConfiguracion, readonly string[]][]) {
    assert.deepEqual(resolverHref(hrefDeSeccion(tab)), { tab });
    for (const sub of subs) assert.deepEqual(resolverHref(hrefDeSeccion(tab, sub)), { tab, sub });
  }
  // Una sub que no es de esa pestaña no se escribe.
  assert.equal(hrefDeSeccion('citas', 'canjes'), '/configuracion?tab=citas');
});

// ─── 2. Los ids de aquí son los que se pintan ───────────────────────────────

function idsDe(fichero: string, patron: RegExp): string[] {
  const fuente = readFileSync(join(RAIZ, fichero), 'utf8');
  return [...new Set([...fuente.matchAll(patron)].map(m => m[1]))].sort();
}

test('page.tsx tiene una pestaña, y la pinta, por cada id de destino.ts', () => {
  const pagina = 'app/(dashboard)/configuracion/page.tsx';
  const esperadas = Object.keys(SECCIONES_CONFIGURACION).sort();
  assert.deepEqual(idsDe(pagina, /id: '([a-z-]+)'/g), esperadas, 'TABS de page.tsx ≠ SECCIONES_CONFIGURACION');
  assert.deepEqual(idsDe(pagina, /activeTab === '([a-z-]+)'\s*&&/g), esperadas, 'alguna pestaña no se pinta');
});

test('cada pestaña con sub-navegación ofrece exactamente las sub-pestañas de destino.ts', () => {
  const ficheros: Partial<Record<TabConfiguracion, [string, RegExp]>> = {
    'clases-salas': ['components/configuracion/tab-clases-salas.tsx', /id: '([a-z-]+)'/g],
    citas: ['components/configuracion/tab-citas.tsx', /id: '([a-z-]+)'/g],
    gamificacion: ['components/configuracion/tab-gamificacion.tsx', /id: '([a-z-]+)'/g],
    estudio: ['components/configuracion/tab-estudio.tsx', /id: '([a-z-]+)'/g],
    api: ['components/configuracion/tab-api.tsx', /setSeccion\('([a-z-]+)'\)/g],
  };
  for (const [tab, subs] of Object.entries(SECCIONES_CONFIGURACION) as [TabConfiguracion, readonly string[]][]) {
    const f = ficheros[tab];
    if (!f) {
      assert.equal(subs.length, 0, `«${tab}» declara sub-pestañas pero el test no sabe dónde se pintan`);
      continue;
    }
    assert.deepEqual(idsDe(f[0], f[1]), [...subs].sort(), `sub-pestañas de «${tab}» (${f[0]})`);
  }
});

// ─── 3. Barrido del repo ────────────────────────────────────────────────────

const DIRECTORIOS = ['app', 'components', 'lib', 'e2e'];
// El propio resolutor escribe plantillas (`?tab=${tab}`) y este test casos rotos a propósito.
const EXCLUIDOS = new Set(['lib/configuracion/destino.ts', 'lib/configuracion/destino.test.ts']);

function ficheros(dir: string): string[] {
  return (readdirSync(join(RAIZ, dir), { recursive: true }) as string[])
    .map(r => join(dir, r))
    .filter(r => /\.tsx?$/.test(r) && !EXCLUIDOS.has(r) && statSync(join(RAIZ, r)).isFile());
}

function paginaExiste(ruta: string): boolean {
  return [join(RAIZ, 'app/(dashboard)', ruta, 'page.tsx'), join(RAIZ, 'app', ruta, 'page.tsx')].some(existsSync);
}

test('⚠️ todo `/configuracion?…` del repo llega a una pestaña y sub-pestaña que existen', () => {
  const rotos: string[] = [];
  let vistos = 0;
  for (const f of DIRECTORIOS.flatMap(ficheros)) {
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
        if (tab !== null && !reconoceTab(tab)) rotos.push(`${donde} → «${tab}» no es ninguna pestaña`);
        if (url.searchParams.get('sub') && !destino.sub) rotos.push(`${donde} → la sub-pestaña se pierde`);
        if (url.hash && !destino.ancla) rotos.push(`${donde} → el ancla se pierde`);
        const subs = SECCIONES_CONFIGURACION[destino.tab] as readonly string[];
        if (destino.sub && !subs.includes(destino.sub)) rotos.push(`${donde} → «${destino.sub}» no es sub-pestaña de «${destino.tab}»`);
      }
    });
  }
  // Verde por vacío no: si el patrón deja de casar, esto tiene que gritar.
  assert.ok(vistos > 40, `solo se han encontrado ${vistos} enlaces a /configuracion?`);
  assert.deepEqual(rotos, [], `\n${rotos.join('\n')}\n`);
});
