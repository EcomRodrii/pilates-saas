// A dónde lleva de verdad un enlace a `/configuracion`.
//
// Un enlace que aterriza en otro sitio es peor que no tener enlace: la
// propietaria pulsa «Ver canjes», ve otra cosa y deja de fiarse del botón. Pasó
// con varios a la vez (auditoría del 15-sep).
//
// Esta función es la ÚNICA que traduce una URL a sección + tarjeta. La usa la
// página al montar y al volver atrás, y la usa el test que recorre el repo
// buscando cada `/configuracion?` escrito a mano.
//
// Configuración se reorganizó por preguntas (15-sep): las doce pestañas de antes
// y sus sub-pestañas son hoy once secciones. Los enlaces viejos siguen vivos en
// notificaciones ya enviadas, correos, la guía y los callbacks de OAuth, así que
// cada `tab`/`sub` antiguo apunta aquí a su sección y a su tarjeta. Las anclas
// salen solas de lib/configuracion/secciones.ts: cuando una tarjeta cambie de
// sección, sus enlaces la siguen sin tocar nada aquí.
//
// Pura: la ejecuta `node --test` directamente.

import {
  SECCIONES, esSeccionId, esTarjetaId, seccionDeTarjeta,
  type RolConfiguracion, type SeccionConfiguracion, type SeccionId, type TarjetaId,
} from './secciones.ts';

export type Destino =
  | { redirect: string }
  /** `tab: null` = ninguna sección: el inicio de Configuración, en todas las anchuras. */
  | { tab: SeccionId | null; ancla?: string };

type Lugar = { tab: SeccionId; ancla?: string };

const en = (ancla: TarjetaId): Lugar => ({ tab: seccionDeTarjeta(ancla), ancla });

// `?tab=` que ya no es una sección. Van los ids de las doce pestañas de antes y
// los alias que ya existían entonces (#848): lo que SE VEÍA en la pestaña.
// ⚠️ `estudio` y `clases` coinciden con ids de hoy y por eso no están aquí:
// mandan como sección nueva.
const LEGADO_TAB: Record<string, Lugar> = {
  'clases-salas': { tab: 'clases' },
  citas: en('servicios-de-cita'),
  'servicios-cita': en('servicios-de-cita'),
  'horario-citas': en('horario-de-citas'),
  salas: en('salas'),
  gamificacion: { tab: 'motivacion' },
  recompensas: en('recompensas'),
  canjes: en('canjes'),
  logros: en('logros'),
  niveles: en('niveles'),
  retos: en('retos'),
  integraciones: { tab: 'conexiones' },
  descubre: en('contenido-de-tu-app'),
  api: en('widgets'),
  'crecimiento-web': en('widgets'),
  campos: en('datos-extra-de-la-ficha'),
  'campos-de-cliente': en('datos-extra-de-la-ficha'),
  'cuestionario-salud': en('cuestionario-de-salud'),
  salud: en('cuestionario-de-salud'),
  cuestionario: en('cuestionario-de-salud'),
  plantillas: en('correos-automaticos'),
  emails: en('correos-automaticos'),
  backups: en('exportar'),
  'copias-de-seguridad': en('exportar'),
};

// `tab/sub` de las sub-pestañas de antes. `estudio/salas` lo escribía el
// calendario («márcalo en Salas») cuando Salas vivía en otra pestaña.
const LEGADO_SUB: Record<string, Lugar> = {
  'estudio/general': { tab: 'estudio' },
  'estudio/sedes': en('sedes'),
  'estudio/horario': en('horario-y-cierres'),
  'estudio/reservas': { tab: 'reservas' },
  'estudio/cobros': { tab: 'cobros' },
  'estudio/enlaces': en('direccion-y-enlaces'),
  'estudio/legal': en('contrato-y-privacidad'),
  'estudio/salas': en('salas'),
  'clases-salas/clases': en('tipos-de-clase'),
  'clases-salas/salas': en('salas'),
  'citas/servicios': en('servicios-de-cita'),
  'citas/horario': en('horario-de-citas'),
  'gamificacion/recompensas': en('recompensas'),
  'gamificacion/canjes': en('canjes'),
  'gamificacion/logros': en('logros'),
  'gamificacion/niveles': en('niveles'),
  'gamificacion/retos': en('retos'),
  'api/widgets': en('widgets'),
  'api/crecimiento': en('widgets'),
};

// Lo que ya no está en Configuración. «Planes y tarifas» se gestiona solo en
// Paquetes desde el 13-sep; «Mi perfil» tiene su propia pantalla, a la que
// llegan todos los roles.
const REDIRECCION_TAB: Record<string, string> = {
  planes: '/productos',
  perfil: '/mi-perfil',
  'mi-perfil': '/mi-perfil',
};

// Los avisos de vuelta de una conexión (OAuth, Embedded Signup de WhatsApp) los
// pinta el componente que tiene esa tarjeta: si la URL trae uno, se abre su
// sección venga el `tab=` que venga — si no, el aviso no sale nunca.
const PARAMS_DE_CONEXION: [string, TarjetaId][] = [
  ['stripe_connected', 'integracion-stripe'], ['stripe_connect_error', 'integracion-stripe'],
  ['gmail_connected', 'integracion-gmail'], ['gmail_error', 'integracion-gmail'],
  ['google_calendar_connected', 'integracion-google_calendar'], ['google_calendar_error', 'integracion-google_calendar'],
  ['zoom_connected', 'integracion-zoom'], ['zoom_error', 'integracion-zoom'],
  ['klaviyo_connected', 'mas-integraciones'], ['klaviyo_error', 'mas-integraciones'],
  ['whatsapp_connected', 'integracion-whatsapp'],
];

// Tarjetas que ya no existen, con la que hace hoy su trabajo. «Exportar a Excel»
// se retiró el 15-sep: queda una sola exportación, «Exportar mis datos». Las
// reglas de reserva eran una sola tarjeta hasta que se partieron en cinco: su
// ancla lleva a la primera.
const ANCLAS_RETIRADAS: Record<string, TarjetaId> = {
  'integracion-excel': 'exportar',
  'reglas-de-reserva': 'reservar',
  // La tarjeta «Marca» pasó a ser una sección (15-sep, v2): sus enlaces
  // (`?tab=web#marca`, `?tab=estudio#marca`) llevan a su logo y favicon.
  marca: 'logo-y-favicon',
};

/**
 * Pantallas sueltas que hoy son una sección de Configuración. Sus páginas
 * redirigen con esto, para que un marcador o un enlace de la guía no se rompan.
 */
export const RUTAS_ANTIGUAS: Readonly<Record<string, string>> = {
  '/configuracion/notificaciones': hrefDeSeccion('avisos'),
  '/configuracion/apariencia/panel': hrefDeSeccion('panel'),
};

/** Cada tarjeta, con su sección. Derivado: nadie lo escribe a mano. */
export const ANCLAS: Readonly<Record<string, SeccionId>> = Object.fromEntries(
  SECCIONES.flatMap(s => s.tarjetas.map(t => [t.id, seccionDeTarjeta(t.id)] as const)),
);

/** ¿`tab` es una sección, un id viejo que sabemos a dónde llevar, o algo que ya vive fuera? */
export function reconoceTab(tab: string): boolean {
  return esSeccionId(tab) || Object.hasOwn(LEGADO_TAB, tab) || Object.hasOwn(REDIRECCION_TAB, tab);
}

/** ¿Esa sub-pestaña vieja tiene sitio hoy? */
export function reconoceSub(tab: string, sub: string): boolean {
  return Object.hasOwn(LEGADO_SUB, `${tab}/${sub}`);
}

export function esAnclaConocida(ancla: string): boolean {
  return esTarjetaId(ancla) || Object.hasOwn(ANCLAS_RETIRADAS, ancla);
}

/**
 * Traduce la URL de `/configuracion` a la sección que hay que abrir.
 *
 * Nunca falla: lo desconocido abre el inicio (`tab: null`). Lo que sí garantiza
 * es que todo lo que conoce llega a su sitio, y que un ancla conocida manda
 * sobre el `tab=` que venga (si no, se haría scroll a nada).
 */
export function resolverDestino(entrada: {
  tab?: string | null;
  sub?: string | null;
  hash?: string | null;
  params?: URLSearchParams | Record<string, string>;
}): Destino {
  const params = entrada.params instanceof URLSearchParams
    ? entrada.params
    : new URLSearchParams(entrada.params ?? {});
  const tab = entrada.tab ?? '';
  const sub = entrada.sub ?? '';

  // Stripe Checkout volvía aquí con `?suscripcion=ok|cancel`, que no leía
  // nadie. Ya vuelve a /suscripcion; esto recoge las sesiones que se abrieron
  // antes del cambio.
  const retornoSuscripcion = params.get('suscripcion');
  if (retornoSuscripcion === 'ok' || retornoSuscripcion === 'cancel') {
    return { redirect: `/suscripcion?suscripcion=${retornoSuscripcion}` };
  }
  if (Object.hasOwn(REDIRECCION_TAB, tab)) return { redirect: REDIRECCION_TAB[tab] };

  let lugar: Lugar | null = null;
  const conexion = PARAMS_DE_CONEXION.find(([p]) => params.has(p));
  if (conexion) lugar = en(conexion[1]);
  else if (sub && reconoceSub(tab, sub)) lugar = { ...LEGADO_SUB[`${tab}/${sub}`] };
  else if (esSeccionId(tab)) lugar = { tab };
  else if (Object.hasOwn(LEGADO_TAB, tab)) lugar = { ...LEGADO_TAB[tab] };

  const ancla = (entrada.hash ?? '').replace(/^#/, '');
  if (/^[a-z0-9][a-z0-9_-]*$/i.test(ancla)) {
    if (esTarjetaId(ancla)) return en(ancla);
    if (Object.hasOwn(ANCLAS_RETIRADAS, ancla)) return en(ANCLAS_RETIRADAS[ancla]);
    if (lugar) return { tab: lugar.tab, ancla };
  }
  return lugar ?? { tab: null };
}

/** Lo mismo, a partir de una URL entera (`/configuracion?tab=…#…`). */
export function resolverHref(href: string): Destino {
  const url = new URL(href, 'https://tentare.invalid');
  return resolverDestino({
    tab: url.searchParams.get('tab'),
    sub: url.searchParams.get('sub'),
    hash: url.hash,
    params: url.searchParams,
  });
}

/** La URL canónica de una sección (y de una tarjeta suya), la que escribe la página. */
export function hrefDeSeccion(tab: SeccionId, ancla?: string): string {
  return `/configuracion?tab=${tab}${ancla ? `#${ancla}` : ''}`;
}

/** Las secciones que un rol puede abrir, en el orden de la lista. */
export function seccionesVisibles(rol: RolConfiguracion | string): SeccionConfiguracion[] {
  return SECCIONES.filter(s => (s.roles as readonly string[]).includes(rol));
}
