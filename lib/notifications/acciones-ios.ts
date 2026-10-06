// Botones en el aviso del iPhone (mantener pulsado el aviso): «Hay sitio para ti»
// → «Aceptar la plaza» / «No, gracias»; el recordatorio de clase → «Voy» /
// «No puedo ir». Puro y sin imports: lo usan el servidor (qué categoría lleva el
// aviso que se manda a APNs), la app (qué hacer con el botón pulsado) y los tests.
//
// ⚠️ Los identificadores tienen que ser LOS MISMOS que registra la app nativa en
// `ios/App/App/AppDelegate.swift` (`UNNotificationCategory`): un test lee ese
// fichero y lo comprueba. Una categoría que la app no conoce sale como un aviso
// sin botones, sin error en ningún sitio.
//
// ⚠️ SEGURIDAD: ningún botón hace nada desde el aviso. Todos son de los que ABREN
// la app (`.foreground`), y lo que se hace después es lo mismo que el botón de la
// pantalla, con la sesión de la alumna en la app: aceptar la oferta por
// `/api/public/aceptar-oferta-espera`, y salir de la lista o «no puedo ir» con su
// confirmación de siempre (nunca se cancela a ciegas). La orden viaja en memoria
// desde el evento nativo (`lib/student/accion-pendiente.ts`), NUNCA en la URL: un
// enlace que alguien fabrique no puede aceptar ni cancelar nada.

export const CATEGORIA_IOS = {
  oferta: 'OFERTA_ESPERA',
  recordatorio: 'RECORDATORIO_CLASE',
} as const;

export const ACCION_IOS = {
  aceptarPlaza: 'aceptar-plaza',
  noGracias: 'no-gracias',
  voy: 'voy',
  noPuedoIr: 'no-puedo-ir',
} as const;

const OFERTA = 'reserva.oferta_lista_espera';
const RECORDATORIOS = new Set(['reserva.recordatorio_24h', 'reserva.recordatorio_1h']);

/** La categoría de iOS de un aviso, por su evento. `null` = un aviso sin botones. */
export function categoriaIos(evento: string | null | undefined): string | null {
  if (evento === OFERTA) return CATEGORIA_IOS.oferta;
  if (evento && RECORDATORIOS.has(evento)) return CATEGORIA_IOS.recordatorio;
  return null;
}

export type TipoAccionPendiente = 'aceptar-oferta' | 'salir-espera' | 'no-puedo-ir';
export interface AccionPendiente { tipo: TipoAccionPendiente; sesionId: string; slug: string }

/** El estudio de la ruta del aviso (`/portal/<slug>/…`), o `null` si no es de la app de un estudio. */
export function slugDeRuta(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const m = /^\/portal\/([a-z0-9][a-z0-9-]{0,62})(?:[/?#]|$)/.exec(url);
  return m ? m[1] : null;
}

/**
 * Qué hacer con un botón pulsado en el aviso:
 * - `null`: lo de siempre (abrir la pantalla del aviso). Es lo que toca con un
 *   toque normal y con cualquier botón que no case con su aviso.
 * - `{ nada: true }`: «Voy» no tiene nada que hacer (no hay «confirmar asistencia»).
 * - `{ ruta, pendiente }`: ir a Mis clases de ese estudio y dejar la orden para
 *   que esa pantalla la ejecute con la sesión de la alumna.
 */
export function accionDeBotonIos(
  actionId: string | null | undefined,
  datos: { ev?: unknown; sid?: unknown; url?: unknown },
): null | { nada: true } | { ruta: string; pendiente: AccionPendiente } {
  if (!actionId || actionId === 'tap' || actionId === 'dismiss') return null;
  const ev = typeof datos.ev === 'string' ? datos.ev : null;
  if (actionId === ACCION_IOS.voy && ev && RECORDATORIOS.has(ev)) return { nada: true };
  const sesionId = typeof datos.sid === 'string' && datos.sid ? datos.sid : null;
  const slug = slugDeRuta(datos.url);
  if (!sesionId || !slug) return null;
  const tipo: TipoAccionPendiente | null =
    ev === OFERTA && actionId === ACCION_IOS.aceptarPlaza ? 'aceptar-oferta'
      : ev === OFERTA && actionId === ACCION_IOS.noGracias ? 'salir-espera'
        : ev && RECORDATORIOS.has(ev) && actionId === ACCION_IOS.noPuedoIr ? 'no-puedo-ir'
          : null;
  if (!tipo) return null;
  return { ruta: `/portal/${slug}/mis-reservas`, pendiente: { tipo, sesionId, slug } };
}
