// A dónde lleva de verdad un enlace a `/configuracion`.
//
// Un enlace que aterriza en otra pestaña es peor que no tener enlace: la
// propietaria pulsa «Ver canjes», ve Recompensas y deja de fiarse del botón.
// Pasaba con varios a la vez (auditoría del 15-sep): `sub=` solo se leía en
// «Estudio», los callbacks de OAuth volvían sin `tab=` y su aviso de
// «conectado» no salía nunca, y `#datos-fiscales` apuntaba a un id que no
// existía.
//
// Esta función es la ÚNICA que traduce una URL a pestaña + sub-pestaña. La usa
// la página al montar y al volver atrás, y la usa el test que recorre el repo
// buscando cada `/configuracion?` escrito a mano. Cuando Configuración se
// reorganice, los ids viejos se apuntan aquí a su sitio nuevo (ALIAS_TAB,
// ALIAS_SUB, ANCLAS) y ningún enlace guardado se rompe.
//
// Pura y sin imports: la ejecuta `node --test` directamente.

/**
 * Las pestañas de hoy y sus sub-pestañas, en el orden en que se ven. Una lista
 * vacía = la pestaña no tiene sub-navegación. El primer id es el que abre por
 * defecto. Los componentes de cada pestaña tipan sus `SUBS` contra esto, y el
 * test comprueba que no falte ninguna.
 */
export const SECCIONES_CONFIGURACION = {
  'clases-salas': ['clases', 'salas'],
  citas: ['servicios', 'horario'],
  gamificacion: ['recompensas', 'canjes', 'logros', 'niveles', 'retos'],
  integraciones: [],
  // «sedes» solo se pinta con varias sedes o plan Cadena; si no está, la
  // pestaña cae a «general» sola (tab-estudio.tsx).
  estudio: ['general', 'sedes', 'horario', 'reservas', 'cobros', 'enlaces', 'legal'],
  descubre: [],
  api: ['widgets', 'crecimiento'],
  campos: [],
  'cuestionario-salud': [],
  plantillas: [],
  backups: [],
  perfil: [],
} as const satisfies Record<string, readonly string[]>;

export type TabConfiguracion = keyof typeof SECCIONES_CONFIGURACION;
export type SubDe<T extends TabConfiguracion> = (typeof SECCIONES_CONFIGURACION)[T][number];

export const TAB_POR_DEFECTO: TabConfiguracion = 'clases-salas';

export type Destino =
  | { redirect: string }
  | { tab: TabConfiguracion; sub?: string; ancla?: string };

type Seccion = { tab: TabConfiguracion; sub?: string };

// Ids de `?tab=` que ya no son una pestaña, y dónde viven hoy:
// - Recompensas/Logros/Niveles/Retos se unificaron en «gamificacion».
// - Clases/Salas en «clases-salas»; Servicios/Horario de citas en «citas».
// - «Crecimiento web» fue pestaña propia (Fase 8) y ahora está dentro de API.
// - Los alias escritos a partir de lo que SE VE en la pestaña (#848): el id
//   interno de «Emails» es «plantillas», el de «Mi perfil» es «perfil»...
const ALIAS_TAB: Record<string, Seccion> = {
  recompensas: { tab: 'gamificacion', sub: 'recompensas' },
  canjes: { tab: 'gamificacion', sub: 'canjes' },
  logros: { tab: 'gamificacion', sub: 'logros' },
  niveles: { tab: 'gamificacion', sub: 'niveles' },
  retos: { tab: 'gamificacion', sub: 'retos' },
  clases: { tab: 'clases-salas', sub: 'clases' },
  salas: { tab: 'clases-salas', sub: 'salas' },
  'servicios-cita': { tab: 'citas', sub: 'servicios' },
  'horario-citas': { tab: 'citas', sub: 'horario' },
  'crecimiento-web': { tab: 'api', sub: 'crecimiento' },
  'campos-de-cliente': { tab: 'campos' },
  emails: { tab: 'plantillas' },
  'copias-de-seguridad': { tab: 'backups' },
  'mi-perfil': { tab: 'perfil' },
  salud: { tab: 'cuestionario-salud' },
  cuestionario: { tab: 'cuestionario-salud' },
};

// Sub-pestañas que se buscaron donde no estaban. `estudio/salas` lo escribía el
// calendario («márcalo en Salas»), y Salas vive en «Clases y salas».
const ALIAS_SUB: Record<string, Seccion> = {
  'estudio/salas': { tab: 'clases-salas', sub: 'salas' },
};

// Lo que ya no está en Configuración. «Planes y tarifas» se gestiona solo en
// Paquetes desde el 13-sep: eran dos pantallas para la misma tabla.
const REDIRECCION_TAB: Record<string, string> = {
  planes: '/productos',
};

// Un ancla con sección propia: el id solo existe dentro de esa sub-pestaña, así
// que el ancla manda sobre el `tab=` que venga (si no, se hace scroll a nada).
const ANCLAS: Record<string, Seccion> = {
  'datos-fiscales': { tab: 'estudio', sub: 'general' },
};

// Los avisos de vuelta de una conexión (OAuth, Embedded Signup de WhatsApp)
// solo los pinta la pestaña Integraciones: si la URL trae uno, se abre esa,
// venga el `tab=` que venga — si no, el aviso no sale nunca.
const PARAMS_DE_INTEGRACIONES = [
  'stripe_connected', 'stripe_connect_error',
  'gmail_connected', 'gmail_error',
  'google_calendar_connected', 'google_calendar_error',
  'zoom_connected', 'zoom_error',
  'klaviyo_connected', 'klaviyo_error',
  'whatsapp_connected',
];

function esTab(v: string): v is TabConfiguracion {
  return Object.hasOwn(SECCIONES_CONFIGURACION, v);
}

function esSubDe(tab: TabConfiguracion, sub: string): boolean {
  return (SECCIONES_CONFIGURACION[tab] as readonly string[]).includes(sub);
}

/** ¿`tab` es una pestaña de hoy o un id viejo que sabemos a dónde llevar? */
export function reconoceTab(tab: string): boolean {
  return esTab(tab) || Object.hasOwn(ALIAS_TAB, tab) || Object.hasOwn(REDIRECCION_TAB, tab);
}

/**
 * Traduce la URL de `/configuracion` a la pestaña que hay que abrir.
 *
 * Nunca falla: un `tab` desconocido abre la pestaña por defecto y un `sub`
 * desconocido la sub-pestaña por defecto (el componente decide cuál). Lo que sí
 * garantiza es que todo lo que conoce llega a su sitio.
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
  const subPedida = entrada.sub ?? '';

  // Stripe Checkout volvía aquí con `?suscripcion=ok|cancel`, que no leía
  // nadie. Ya vuelve a /suscripcion; esto recoge las sesiones que se abrieron
  // antes del cambio.
  const retornoSuscripcion = params.get('suscripcion');
  if (retornoSuscripcion === 'ok' || retornoSuscripcion === 'cancel') {
    return { redirect: `/suscripcion?suscripcion=${retornoSuscripcion}` };
  }
  if (Object.hasOwn(REDIRECCION_TAB, tab)) return { redirect: REDIRECCION_TAB[tab] };

  let seccion: Seccion;
  if (PARAMS_DE_INTEGRACIONES.some(p => params.has(p))) {
    seccion = { tab: 'integraciones' };
  } else if (esTab(tab)) {
    seccion = { tab };
    if (subPedida) {
      if (esSubDe(tab, subPedida)) seccion.sub = subPedida;
      else if (Object.hasOwn(ALIAS_SUB, `${tab}/${subPedida}`)) seccion = { ...ALIAS_SUB[`${tab}/${subPedida}`] };
    }
  } else if (Object.hasOwn(ALIAS_TAB, tab)) {
    seccion = { ...ALIAS_TAB[tab] };
  } else {
    seccion = { tab: TAB_POR_DEFECTO };
  }

  const ancla = (entrada.hash ?? '').replace(/^#/, '');
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(ancla)) return seccion;
  if (Object.hasOwn(ANCLAS, ancla)) return { ...ANCLAS[ancla], ancla };
  return { ...seccion, ancla };
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

/** La URL canónica de una sección, la que la página escribe al elegirla. */
export function hrefDeSeccion(tab: TabConfiguracion, sub?: string): string {
  return sub && esSubDe(tab, sub)
    ? `/configuracion?tab=${tab}&sub=${sub}`
    : `/configuracion?tab=${tab}`;
}
