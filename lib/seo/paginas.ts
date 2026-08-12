// ─────────────────────────────────────────────────────────────────────────────
// Registro de páginas SEO públicas — FUENTE ÚNICA DE VERDAD.
//
// De aquí salen: el sitemap (app/sitemap.ts), las migas de pan y el JSON-LD de
// cada página, el hub /funcionalidades, el bloque "relacionadas" de cada página
// y los enlaces de producto del footer.
//
// ⚠️ Existe porque ya se perdió una tanda entera: las 7 páginas de
// /comparativa/tentare-vs-* llevaban meses publicadas, con metadata y OG
// propios, y NUNCA estuvieron en el sitemap — se mantenía una lista a mano y
// nadie la actualizó al crearlas. `paginas.test.ts` recorre `app/` y falla si
// aparece una página pública que no esté aquí, de modo que el fallo no puede
// repetirse en silencio.
//
// Sin imports con alias `@/` ni extensiones implícitas: `npm test` corre con
// `node --test --experimental-strip-types`, que no resuelve ninguna de las dos
// cosas. Mismo criterio que lib/nav-config.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { LEGAL } from '../legal-info.ts';

/**
 * Origen canónico del sitio. **No se escribe aquí**: se deriva de `LEGAL.url`,
 * que es la única definición del dominio en el repo.
 *
 * Tenerlo escrito dos veces es justo lo que produjo la divergencia que este
 * módulo arregla: `LEGAL.url` y este `BASE_URL` decían `https://tentare.app`
 * mientras el sitio se servía en `www.tentare.app`, y cada canonical apuntaba
 * a una URL que redirige. `paginas.test.ts` comprueba que nadie vuelva a
 * escribir el origen a mano en ningún otro sitio.
 */
export const BASE_URL: string = LEGAL.url;

/** Los cuatro grupos de la arquitectura, más el bloque legal. */
export type GrupoSeo = 'home' | 'software' | 'funcionalidades' | 'soluciones' | 'recursos' | 'legal';

export interface PaginaSeo {
  /** Ruta absoluta sin dominio y SIN barra final ('/' es la única excepción). */
  path: string;
  /** `<title>` completo de la página. Único en todo el registro. */
  titulo: string;
  /** `meta description`. Única en todo el registro. */
  descripcion: string;
  grupo: GrupoSeo;
  /** Nombre corto: migas de pan, tarjetas del hub y enlaces del footer. */
  etiqueta: string;
  /** Una línea para las tarjetas del hub y del bloque "relacionadas". */
  resumen?: string;
  /** Prioridad del sitemap (0–1). */
  prioridad: number;
  changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  /**
   * Fecha real de publicación o última revisión del CONTENIDO ('YYYY-MM-DD'),
   * para el `lastModified` del sitemap. Se omite cuando no se sabe: una fecha
   * inventada es peor señal que ninguna — Google la contrasta con lo que ve al
   * rastrear y deja de fiarse del sitemap entero si no cuadra.
   */
  actualizado?: string;
  /**
   * Interlinking. Son paths de ESTE registro (el test lo comprueba), así que un
   * enlace interno no puede apuntar a una página que ya no existe.
   */
  relacionadas?: string[];
}

/** Fecha de publicación del lote de páginas de funcionalidades y /precios. */
const PUBLICADO = '2026-08-11';

// ─── Funcionalidades ─────────────────────────────────────────────────────────
// El orden de este array es el orden del hub /funcionalidades y del footer.

const FUNCIONALIDADES: PaginaSeo[] = [
  {
    path: '/funcionalidades/reservas-online',
    titulo: 'Software de reservas para estudios de Pilates | Tentare',
    descripcion:
      'Tus alumnas reservan y cancelan desde el móvil, 24/7. Antelación mínima y máxima, exigir bono activo y aprobación manual — reglas por tipo de clase, no solo del estudio.',
    grupo: 'funcionalidades',
    etiqueta: 'Reservas online',
    resumen: 'Reservan solas desde el móvil, con las reglas que tú pongas.',
    prioridad: 0.9,
    changeFrequency: 'monthly',
    actualizado: PUBLICADO,
    relacionadas: ['/funcionalidades/lista-de-espera', '/funcionalidades/cancelaciones-y-politicas', '/funcionalidades/app-para-alumnas'],
  },
  {
    path: '/funcionalidades/lista-de-espera',
    titulo: 'Lista de espera automática para clases de Pilates | Tentare',
    descripcion:
      'Cuando alguien cancela, la plaza se ofrece sola a la siguiente de la lista — con un plazo de aceptación configurable por tipo de clase. El hueco no se pierde.',
    grupo: 'funcionalidades',
    etiqueta: 'Lista de espera',
    resumen: 'La plaza que se libera se ofrece sola, con plazo para aceptarla.',
    prioridad: 0.9,
    changeFrequency: 'monthly',
    actualizado: PUBLICADO,
    relacionadas: ['/funcionalidades/reservas-online', '/funcionalidades/cancelaciones-y-politicas', '/funcionalidades/calendario-y-salas'],
  },
  {
    path: '/funcionalidades/calendario-y-salas',
    titulo: 'Calendario de clases, salas y aforo por reformer | Tentare',
    descripcion:
      'Series recurrentes, varias salas y capacidad por reformer, no solo un número de aforo. Una máquina averiada baja la capacidad de esa clase sola.',
    grupo: 'funcionalidades',
    etiqueta: 'Calendario y salas',
    resumen: 'Series, salas y capacidad puesto a puesto — no un número de aforo.',
    prioridad: 0.9,
    changeFrequency: 'monthly',
    actualizado: PUBLICADO,
    relacionadas: ['/funcionalidades/reservas-online', '/funcionalidades/control-de-asistencia', '/funcionalidades/gestion-de-instructoras'],
  },
  {
    path: '/funcionalidades/gestion-de-instructoras',
    titulo: 'Gestión de instructoras: disponibilidad, horas y tarifas | Tentare',
    descripcion:
      'Disponibilidad semanal, vacaciones y bajas, tarifa por hora y liquidación mensual. Y un aviso cuando tu estudio depende demasiado de una sola persona.',
    grupo: 'funcionalidades',
    etiqueta: 'Gestión de instructoras',
    resumen: 'Disponibilidad, horas, tarifas y liquidaciones de todo tu equipo.',
    prioridad: 0.9,
    changeFrequency: 'monthly',
    actualizado: PUBLICADO,
    relacionadas: ['/funcionalidades/sustituciones', '/funcionalidades/calendario-y-salas', '/funcionalidades/informes-y-rentabilidad'],
  },
  {
    path: '/funcionalidades/sustituciones',
    titulo: 'Sustituciones de instructoras automáticas | Tentare',
    descripcion:
      'Una instructora avisa de que no puede y el sistema busca sustituta, la contacta, escala si no responde y avisa a las alumnas. Con cuatro niveles de autonomía.',
    grupo: 'funcionalidades',
    etiqueta: 'Sustituciones',
    resumen: 'La baja se cubre sola: candidatas, contacto, escalado y aviso.',
    prioridad: 1,
    changeFrequency: 'monthly',
    actualizado: PUBLICADO,
    relacionadas: ['/funcionalidades/gestion-de-instructoras', '/funcionalidades/calendario-y-salas', '/recursos/cubrir-baja-instructora'],
  },
  {
    path: '/funcionalidades/bonos-y-membresias',
    titulo: 'Bonos, cuotas y plazas fijas para tu estudio | Tentare',
    descripcion:
      'Bonos de sesiones, cuotas mensuales, planes limitados a un tipo de clase y plazas fijas con recuperaciones. Los cuatro modelos con los que cobra un estudio de Pilates.',
    grupo: 'funcionalidades',
    etiqueta: 'Bonos y membresías',
    resumen: 'Bonos, cuotas, planes por tipo de clase y plazas fijas.',
    prioridad: 0.9,
    changeFrequency: 'monthly',
    actualizado: PUBLICADO,
    relacionadas: ['/funcionalidades/cobros-recurrentes', '/funcionalidades/reservas-online', '/funcionalidades/ficha-de-clienta'],
  },
  {
    path: '/funcionalidades/cobros-recurrentes',
    titulo: 'Cobro recurrente y recuperación de impagos | Tentare',
    descripcion:
      'Cobro automático con la tarjeta guardada, tres reintentos escalonados cuando falla, reembolsos desde el panel y remesa SEPA 19.14 para tu banco de siempre.',
    grupo: 'funcionalidades',
    etiqueta: 'Cobros recurrentes',
    resumen: 'Cobra solo, reintenta lo que falla y avisa cuando toca.',
    prioridad: 0.9,
    changeFrequency: 'monthly',
    actualizado: PUBLICADO,
    relacionadas: ['/funcionalidades/facturacion', '/funcionalidades/bonos-y-membresias', '/precios'],
  },
  {
    path: '/funcionalidades/facturacion',
    titulo: 'Facturación con Veri*Factu para estudios de Pilates | Tentare',
    descripcion:
      'Cada cobro genera su factura con numeración correlativa, huella encadenada y QR de verificación, firmada y transmitida a la AEAT. Y el cierre de año listo para tu gestoría.',
    grupo: 'funcionalidades',
    etiqueta: 'Facturación',
    resumen: 'Del cobro a la factura sellada y enviada a Hacienda, sin tocar nada.',
    prioridad: 0.9,
    changeFrequency: 'monthly',
    actualizado: PUBLICADO,
    relacionadas: ['/funcionalidades/cobros-recurrentes', '/recursos/facturacion-electronica-verifactu', '/seguridad'],
  },
  {
    path: '/funcionalidades/ficha-de-clienta',
    titulo: 'CRM y ficha de alumna para estudios de Pilates | Tentare',
    descripcion:
      'Historial, bonos, asistencia y notas de progreso de cada alumna en un sitio. Con ficha de salud operativa —lesiones, zonas y adaptaciones— visible solo para quien debe verla.',
    grupo: 'funcionalidades',
    etiqueta: 'Ficha de clienta',
    resumen: 'Todo lo de cada alumna en una ficha, incluida su ficha de salud.',
    prioridad: 0.9,
    changeFrequency: 'monthly',
    actualizado: PUBLICADO,
    relacionadas: ['/funcionalidades/automatizaciones-y-avisos', '/funcionalidades/bonos-y-membresias', '/seguridad'],
  },
  {
    path: '/funcionalidades/automatizaciones-y-avisos',
    titulo: 'Automatizaciones y avisos por WhatsApp y email | Tentare',
    // ⚠️ El recuento de esta página se comprobó contra el código antes de
    // escribirla y NO era el que se suponía: los 10 disparadores de
    // `TriggerAutomatizacion` solo se configuran desde /marketing, que está
    // apagado (MARKETING_MODULE_ENABLED=false). Lo que un estudio puede
    // encender hoy son las 7 reglas de `TRIGGERS_IMPLEMENTADOS`
    // (lib/engines/automation-engine.ts) más los 37 tipos de aviso del motor
    // de notificaciones (lib/notifications/catalog.ts). Si algún día se
    // reactiva marketing, esta descripción se queda corta — no al revés.
    descripcion:
      'Recordatorios de clase, bonos casi agotados, alumnas que llevan semanas sin venir y pagos vencidos. Siete reglas que enciendes tú y treinta y siete avisos por cinco canales.',
    grupo: 'funcionalidades',
    etiqueta: 'Automatizaciones y avisos',
    resumen: 'Siete reglas que trabajan solas y avisos por el canal de cada una.',
    prioridad: 0.9,
    changeFrequency: 'monthly',
    actualizado: PUBLICADO,
    relacionadas: ['/funcionalidades/ficha-de-clienta', '/funcionalidades/lista-de-espera', '/funcionalidades/cobros-recurrentes'],
  },
  {
    path: '/funcionalidades/informes-y-rentabilidad',
    titulo: 'Informes de rentabilidad y ocupación de clases | Tentare',
    descripcion:
      'Ingresos, ocupación por tipo de clase, retención por cohorte y el margen de cada clase concreta, cruzando lo que pagó cada asistente con la tarifa real de la instructora.',
    grupo: 'funcionalidades',
    etiqueta: 'Informes y rentabilidad',
    resumen: 'Qué clases dan dinero de verdad, clase por clase.',
    prioridad: 0.9,
    changeFrequency: 'monthly',
    actualizado: PUBLICADO,
    relacionadas: ['/funcionalidades/gestion-de-instructoras', '/funcionalidades/calendario-y-salas', '/funcionalidades/bonos-y-membresias'],
  },

  {
    path: '/funcionalidades/cancelaciones-y-politicas',
    titulo: 'Política de cancelación y no-shows para tu estudio | Tentare',
    descripcion:
      'Ventana de cancelación por tipo de clase, quién recupera su sesión y quién no, y penalización económica por cancelar tarde o no presentarse — con consentimiento comprobado antes de cobrar.',
    grupo: 'funcionalidades',
    etiqueta: 'Cancelaciones y no-shows',
    resumen: 'Qué pasa con la plaza, con el bono y —si quieres— con el cobro.',
    prioridad: 0.9,
    changeFrequency: 'monthly',
    actualizado: PUBLICADO,
    relacionadas: ['/funcionalidades/reservas-online', '/funcionalidades/lista-de-espera', '/funcionalidades/cobros-recurrentes'],
  },
  {
    path: '/funcionalidades/app-para-alumnas',
    titulo: 'App de marca para las alumnas de tu estudio | Tentare',
    descripcion:
      'Tus alumnas reservan, compran y ven su progreso desde una app con tu nombre, tu logo y tus colores, que se instala en su móvil sin pasar por ninguna tienda.',
    grupo: 'funcionalidades',
    etiqueta: 'App de marca',
    resumen: 'Tu estudio en su móvil, con tu nombre y no con el nuestro.',
    prioridad: 0.9,
    changeFrequency: 'monthly',
    actualizado: PUBLICADO,
    relacionadas: ['/funcionalidades/reservas-online', '/funcionalidades/ficha-de-clienta', '/funcionalidades/bonos-y-membresias'],
  },

  {
    path: '/funcionalidades/control-de-asistencia',
    titulo: 'Control de asistencia y no-shows en tu estudio | Tentare',
    descripcion:
      'Marca quién vino con un QR en la puerta, con un código corto o sin hacer nada — y detecta a quien reserva y falla, con un riesgo de plantón que pesa lo reciente.',
    grupo: 'funcionalidades',
    etiqueta: 'Control de asistencia',
    resumen: 'Quién vino y quién falló, con o sin escanear nada.',
    prioridad: 0.8,
    changeFrequency: 'monthly',
    actualizado: PUBLICADO,
    relacionadas: ['/funcionalidades/cancelaciones-y-politicas', '/funcionalidades/calendario-y-salas', '/funcionalidades/ficha-de-clienta'],
  },
  {
    path: '/funcionalidades/multi-centro',
    titulo: 'Software para cadenas con varios centros de Pilates | Tentare',
    descripcion:
      'Varias sedes bajo un mismo acceso, con datos separados, menú compartido por cadena e instructoras que trabajan en más de un centro con rol y tarifa propios en cada uno.',
    grupo: 'funcionalidades',
    etiqueta: 'Varias sedes',
    resumen: 'Dos o más centros, con datos separados y un solo acceso.',
    prioridad: 0.8,
    changeFrequency: 'monthly',
    actualizado: PUBLICADO,
    relacionadas: ['/funcionalidades/gestion-de-instructoras', '/precios', '/seguridad'],
  },
];

// ─── Registro completo ───────────────────────────────────────────────────────

export const PAGINAS: PaginaSeo[] = [
  {
    path: '/',
    titulo: 'Tentare — Software para estudios de Pilates | Reservas, cobros y sustituciones',
    descripcion:
      'El software completo para tu estudio de Pilates en España: reservas, cobros, calendario, alumnas e instructoras — y el que cubre las bajas de instructoras solo. Sin permanencia, desde 29€/mes.',
    grupo: 'home',
    etiqueta: 'Inicio',
    prioridad: 1,
    changeFrequency: 'weekly',
    relacionadas: ['/funcionalidades', '/precios', '/comparativa'],
  },
  {
    path: '/precios',
    titulo: 'Precios de Tentare — Software para estudios de Pilates desde 29€/mes',
    descripcion:
      'Tres planes con precio público y sin permanencia: Base 29€, Estudio 59€ y Cadena 149€ al mes. Qué incluye cada uno, qué límites tiene y qué se cobra aparte.',
    grupo: 'software',
    etiqueta: 'Precios',
    resumen: 'Tres planes, precio público, sin permanencia y con prueba de 14 días.',
    prioridad: 0.9,
    changeFrequency: 'monthly',
    actualizado: PUBLICADO,
    relacionadas: ['/funcionalidades', '/comparativa', '/funcionalidades/cobros-recurrentes'],
  },
  {
    path: '/funcionalidades',
    titulo: 'Funcionalidades de Tentare para estudios de Pilates | Tentare',
    descripcion:
      'Todo lo que hace Tentare, área por área: reservas, lista de espera, calendario y salas, asistencia, instructoras, sustituciones, bonos, cobros, facturación, fichas, avisos e informes.',
    grupo: 'funcionalidades',
    etiqueta: 'Funcionalidades',
    resumen: 'El mapa completo del producto, área por área.',
    prioridad: 0.9,
    changeFrequency: 'monthly',
    actualizado: PUBLICADO,
    relacionadas: ['/precios', '/comparativa', '/recursos'],
  },
  ...FUNCIONALIDADES,

  // ── Ya existían antes de este registro ────────────────────────────────────
  {
    path: '/comparativa',
    titulo: 'Comparativa: Tentare vs bsport, Mindbody y Eversports',
    descripcion:
      'Compara Tentare con el software de gestión tradicional para estudios de Pilates en España: facturación Veri*factu, precio público, permanencia, datos en la UE y sustitución de instructoras.',
    grupo: 'software',
    etiqueta: 'Comparativa',
    resumen: 'Tentare frente a las siete plataformas con las que más se compara.',
    prioridad: 0.8,
    changeFrequency: 'monthly',
    relacionadas: ['/precios', '/funcionalidades', '/seguridad'],
  },
  ...([
    ['tentare-vs-mindbody', 'Mindbody'],
    ['tentare-vs-bsport', 'bsport'],
    ['tentare-vs-momence', 'Momence'],
    ['tentare-vs-timp', 'TIMP'],
    ['tentare-vs-eversports', 'Eversports'],
    ['tentare-vs-lorari', 'Lorari'],
    ['tentare-vs-bonsai', 'Bonsai'],
  ] as const).map(([slug, nombre]): PaginaSeo => ({
    path: `/comparativa/${slug}`,
    titulo: `Tentare vs ${nombre}: comparativa para estudios de Pilates en España`,
    descripcion: `Precio, permanencia, facturación Veri*factu, dónde se alojan tus datos y sustitución de instructoras — Tentare frente a ${nombre}, punto por punto.`,
    grupo: 'software',
    etiqueta: `Tentare vs ${nombre}`,
    prioridad: 0.7,
    changeFrequency: 'monthly',
    relacionadas: ['/comparativa', '/precios'],
  })),
  {
    path: '/recursos',
    titulo: 'Centro de Recursos — Guías para tu estudio de Pilates | Tentare',
    descripcion:
      'Guías prácticas para propietarias de estudios de Pilates: ocupación, precios, sustituciones, retención y la parte administrativa que nadie te contó.',
    grupo: 'recursos',
    etiqueta: 'Recursos',
    resumen: 'Guías prácticas de gestión, sin humo.',
    prioridad: 0.8,
    changeFrequency: 'weekly',
    relacionadas: ['/glosario', '/funcionalidades'],
  },
  ...([
    ['cubrir-baja-instructora', '2026-07-01', 'Cómo cubrir una baja de instructora sin hacer una llamada'],
    ['facturacion-electronica-verifactu', '2026-07-01', 'Facturación electrónica para estudios en España'],
    ['precios-reformer-mat', '2026-07-01', 'Reformer vs. mat: cómo poner precio a cada clase'],
    ['estudios-pilates-de-exito', '2026-08-06', 'Qué puedes aprender de los estudios de Pilates que más crecen'],
    ['ocupacion-clases-valle', '2026-08-06', 'Cómo subir la ocupación de tus clases valle'],
    ['reducir-cancelaciones-ultima-hora', '2026-08-06', 'Reduce las cancelaciones de última hora'],
    ['checklist-elegir-software-estudio', '2026-08-06', 'Checklist: cómo elegir el software de tu estudio'],
  ] as const).map(([slug, actualizado, titulo]): PaginaSeo => ({
    path: `/recursos/${slug}`,
    titulo,
    descripcion: `Guía de Tentare para propietarias de estudios de Pilates: ${titulo.toLowerCase()}.`,
    grupo: 'recursos',
    etiqueta: titulo,
    actualizado,
    prioridad: 0.7,
    changeFrequency: 'monthly',
    relacionadas: ['/recursos'],
  })),
  {
    path: '/glosario',
    titulo: 'Glosario del software de gestión para estudios de Pilates — Tentare',
    descripcion:
      'Definiciones claras y neutrales de los términos del sector: software de gestión, pilates reformer, Veri*factu, lista de espera automática, CRM de estudio y más.',
    grupo: 'recursos',
    etiqueta: 'Glosario',
    resumen: 'Qué significa cada término del sector, sin marketing.',
    prioridad: 0.8,
    changeFrequency: 'monthly',
    relacionadas: ['/recursos', '/funcionalidades'],
  },
  {
    path: '/seguridad',
    titulo: 'Seguridad y protección de datos — Tentare',
    descripcion:
      'Cómo protege Tentare los datos de tu estudio y de tus alumnas: aislamiento por estudio, cifrado, RGPD, alojamiento en la UE y exportación de tus datos cuando quieras.',
    grupo: 'recursos',
    etiqueta: 'Seguridad',
    resumen: 'Aislamiento por estudio, RGPD y datos en la UE.',
    prioridad: 0.6,
    changeFrequency: 'monthly',
    relacionadas: ['/funcionalidades/ficha-de-clienta', '/comparativa'],
  },

  // ── Legales ───────────────────────────────────────────────────────────────
  ...([
    ['/legal', 'Aviso legal', 'Aviso legal de Tentare: titular del sitio, condiciones de uso y propiedad intelectual.'],
    ['/privacidad', 'Privacidad', 'Política de privacidad de Tentare: qué datos tratamos, con qué base legal, quién los procesa y cómo ejercer tus derechos.'],
    ['/terminos', 'Términos', 'Términos y condiciones del servicio Tentare: contratación, planes, pagos, cancelación y responsabilidades.'],
    ['/cookies', 'Cookies', 'Política de cookies de Tentare: qué cookies usamos, para qué sirven y cómo gestionarlas.'],
  ] as const).map(([path, etiqueta, descripcion]): PaginaSeo => ({
    path,
    titulo: `${etiqueta} — Tentare`,
    descripcion,
    grupo: 'legal',
    etiqueta,
    prioridad: 0.3,
    changeFrequency: 'yearly',
  })),
];

// ─── Consultas ───────────────────────────────────────────────────────────────

const PORPATH = new Map(PAGINAS.map((p) => [p.path, p]));

export function paginaDe(path: string): PaginaSeo | undefined {
  return PORPATH.get(path);
}

export function porGrupo(grupo: GrupoSeo): PaginaSeo[] {
  return PAGINAS.filter((p) => p.grupo === grupo);
}

/** Las 10 páginas de funcionalidad, en orden, sin el hub. */
export function funcionalidades(): PaginaSeo[] {
  return FUNCIONALIDADES;
}

/**
 * Las páginas relacionadas de `path`, ya resueltas. Silencia las que no existan
 * en vez de reventar en runtime: el test es quien tiene que cazar un path roto,
 * no la propietaria que está leyendo la página.
 */
export function relacionadasDe(path: string): PaginaSeo[] {
  return (paginaDe(path)?.relacionadas ?? []).map((r) => PORPATH.get(r)).filter((p): p is PaginaSeo => Boolean(p));
}

/** URL absoluta de un path del registro. `/` no lleva barra final duplicada. */
export function urlDe(path: string): string {
  return path === '/' ? BASE_URL : `${BASE_URL}${path}`;
}

/**
 * Prefijos que NO deben indexarse: panel, portal, zonas autenticadas y páginas
 * de un solo uso abiertas por enlace firmado (valorar, no-puedo…). Es la fuente
 * de `app/robots.ts` Y el filtro del test de cobertura, para que las dos listas
 * no puedan divergir — que es justo como se coló media docena de rutas del
 * panel sin bloquear.
 *
 * Semántica robots.txt: prefijo de CADENA, no de segmento. `/portal` cubre
 * también `/portal-preview`, y `/reservar` cubre `/reservar/<slug>`.
 */
export const PREFIJOS_NO_INDEXABLES = [
  // Infraestructura y autenticación
  '/api', '/login', '/crear-estudio', '/suscripcion', '/invitacion', '/clave-nueva', '/interno',
  // Puerta de demo temporal para grabar vídeo — no es contenido real, nunca indexable
  '/demo',
  // Cara pública operativa de cada estudio (decisión: B2B primero, sin miles de URLs por estudio)
  '/portal', '/kiosk', '/reservar',
  // Enlaces firmados de un solo uso
  '/aceptar-sustitucion', '/confirmar-reserva', '/disponibilidad', '/no-puedo', '/valorar',
  // Panel de gestión — TODOS los segmentos de app/(dashboard)
  '/automatizaciones', '/calendario', '/centro-de-control', '/chat', '/cierre', '/citas',
  '/clientas', '/cobros', '/comunidad', '/configuracion', '/contenido', '/dashboard',
  '/equipo', '/explorar-funciones', '/facturas', '/informes', '/libreta', '/marketing',
  '/mensajeria', '/mi-perfil', '/migracion', '/notificaciones', '/ondemand', '/pagos',
  '/pos', '/primeros-pasos', '/productos', '/socios', '/sustituciones', '/transacciones',
] as const;

/** ¿Esta ruta cae bajo un prefijo bloqueado? Prefijo de cadena, como robots.txt. */
export function esNoIndexable(path: string): boolean {
  return PREFIJOS_NO_INDEXABLES.some((p) => path.startsWith(p));
}
