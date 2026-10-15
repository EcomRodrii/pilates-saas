// ─────────────────────────────────────────────────────────────────────────────
// El registro de Notificaciones (/notificaciones) en el panel nuevo: las cifras
// de arriba y los filtros de la lista, sobre lo que la pantalla ya carga de
// /api/notifications/admin. Nada de esto pide datos nuevos.
//
// Las cifras cuentan AVISOS (filas), no entregas: un aviso sale por varios
// canales a la vez, y la tarjeta que se pulsa tiene que enseñar tantas filas
// como dice su número. Por eso un mismo aviso puede contar en «enviados» (la app
// lo aceptó) y en «con fallo» (el correo no salió) a la vez.
//
// «Enviado» es lo que el canal ACEPTÓ (`SENT`) o lo que el dispositivo dice que
// enseñó (`DELIVERED`, solo push): no es «le llegó». Lo mismo que dice la tabla
// de siempre con «aceptado» y «mostrado en el dispositivo».
//
// Puro: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

/** Cuántos avisos devuelve /api/notifications/admin como mucho (su `.limit`). */
export const TOPE_REGISTRO = 150;

export type CanalRegistro = 'todos' | 'INAPP' | 'PUSH' | 'EMAIL';
export type EstadoRegistro = 'todos' | 'enviados' | 'fallo' | 'sin_enviar';

export interface EntregaRegistro { channel: string; status: string }
export interface AvisoRegistro { deliveries: readonly EntregaRegistro[] }

/** Lo que sale de cada estado, sin jerga (el mismo texto que la tabla de siempre). */
export const ESTADO_ENTREGA_TEXTO: Record<string, string> = {
  SENT: 'aceptado', DELIVERED: 'mostrado en el dispositivo', PENDING: 'pendiente',
  SKIPPED: 'no enviado', FAILED: 'falló',
};

const SALIO = new Set(['SENT', 'DELIVERED']);

/** Las entregas de un aviso que cuentan con el canal elegido. */
export function entregasDelCanal<E extends EntregaRegistro>(entregas: readonly E[], canal: CanalRegistro): E[] {
  return canal === 'todos' ? [...entregas] : entregas.filter(e => e.channel === canal);
}

/** ¿Cumplen estas entregas el estado pedido? */
export function cumpleEstado(entregas: readonly EntregaRegistro[], estado: EstadoRegistro): boolean {
  switch (estado) {
    case 'todos': return true;
    case 'enviados': return entregas.some(e => SALIO.has(e.status));
    case 'fallo': return entregas.some(e => e.status === 'FAILED');
    // Nada salió: todo lo que se intentó se quedó sin enviar (sin cuenta, sin
    // avisos activados, sin email…). Un aviso sin ninguna entrega tampoco salió.
    // Lo PENDIENTE no cuenta: aún puede salir.
    case 'sin_enviar': return entregas.every(e => e.status === 'SKIPPED');
  }
}

/** Los avisos que se ven con este canal y este estado. */
export function filtrarRegistro<T extends AvisoRegistro>(avisos: readonly T[], canal: CanalRegistro, estado: EstadoRegistro): T[] {
  return avisos.filter(a => {
    const entregas = entregasDelCanal(a.deliveries, canal);
    // Con un canal elegido, solo los avisos que salieron (o lo intentaron) por él.
    if (canal !== 'todos' && entregas.length === 0) return false;
    return cumpleEstado(entregas, estado);
  });
}

export interface CifrasRegistro {
  /** Avisos que se ven con este canal. */
  avisos: number;
  /** Con al menos una entrega aceptada o mostrada. */
  enviados: number;
  /** De esos, los que el dispositivo dice que enseñó (push). */
  mostrados: number;
  /** Con al menos una entrega fallida: los que llevan «Reintentar». */
  conFallo: number;
  /** Los que no salieron por ningún canal (de los elegidos). */
  sinEnviar: number;
}

/** Las cifras de arriba: cada una es el número de filas que enseña su filtro. */
export function cifrasRegistro(avisos: readonly AvisoRegistro[], canal: CanalRegistro): CifrasRegistro {
  const c: CifrasRegistro = { avisos: 0, enviados: 0, mostrados: 0, conFallo: 0, sinEnviar: 0 };
  for (const a of avisos) {
    const entregas = entregasDelCanal(a.deliveries, canal);
    if (canal !== 'todos' && entregas.length === 0) continue;
    c.avisos++;
    if (cumpleEstado(entregas, 'enviados')) c.enviados++;
    if (entregas.some(e => e.status === 'DELIVERED')) c.mostrados++;
    if (cumpleEstado(entregas, 'fallo')) c.conFallo++;
    if (cumpleEstado(entregas, 'sin_enviar')) c.sinEnviar++;
  }
  return c;
}

export interface AvisoBuscable {
  recipientName?: string | null;
  recipientRole: string;
  title: string;
  body: string;
  eventType: string;
  deliveries: readonly { error: string | null; detalle?: string | null }[];
}

/** El buscador: destinatario, aviso o error, como el de la tabla de siempre. */
export function coincideBusqueda(aviso: AvisoBuscable, texto: string): boolean {
  const q = texto.trim().toLowerCase();
  if (!q) return true;
  return [
    aviso.recipientName, aviso.recipientRole, aviso.title, aviso.body, aviso.eventType,
    ...aviso.deliveries.map(d => d.error), ...aviso.deliveries.map(d => d.detalle),
  ].some(t => (t ?? '').toLowerCase().includes(q));
}
