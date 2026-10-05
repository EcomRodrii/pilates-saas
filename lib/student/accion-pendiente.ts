// La orden que deja un botón del aviso del iPhone («Aceptar la plaza», «No,
// gracias», «No puedo ir») para que la ejecute Mis clases con la sesión de la
// alumna. Ver `lib/notifications/acciones-ios.ts`.
//
// ⚠️ Vive EN MEMORIA y solo la escribe el evento nativo del aviso
// (`PuenteNativo`): ni URL, ni almacenamiento. Así un enlace fabricado por
// cualquiera no puede pedir a la app que acepte o cancele nada.
//
// Caduca: una orden que nadie ha recogido en dos minutos (la pantalla no llegó a
// abrirse) no se ejecuta más tarde por sorpresa.

import type { AccionPendiente } from '../notifications/acciones-ios.ts';

const VIDA_MS = 2 * 60_000;

let pendiente: { accion: AccionPendiente; hasta: number } | null = null;
const oyentes = new Set<() => void>();

export function dejarAccionPendiente(accion: AccionPendiente, ahoraMs = Date.now()): void {
  pendiente = { accion, hasta: ahoraMs + VIDA_MS };
  for (const o of oyentes) o();
}

/**
 * ¿Hay una orden viva para ESTE estudio? Sin recogerla: Mis clases primero trae
 * datos frescos y solo entonces la recoge (`tomarAccionPendiente`). Si la pantalla
 * se va antes, la orden sigue ahí para la próxima vez (hasta que caduque).
 */
export function hayAccionPendiente(slug: string, ahoraMs = Date.now()): boolean {
  return !!pendiente && pendiente.hasta >= ahoraMs && pendiente.accion.slug === slug;
}

/** La orden para ESTE estudio, si la hay y sigue viva. La recoge (no se ejecuta dos veces). */
export function tomarAccionPendiente(slug: string, ahoraMs = Date.now()): AccionPendiente | null {
  if (!pendiente) return null;
  if (pendiente.hasta < ahoraMs) { pendiente = null; return null; }
  if (pendiente.accion.slug !== slug) return null;
  const a = pendiente.accion;
  pendiente = null;
  return a;
}

/** Avisa cuando llega una orden (la app ya estaba en Mis clases y se pulsa otro aviso). */
export function alLlegarAccionPendiente(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => { oyentes.delete(oyente); };
}

/**
 * Qué hacer con la orden, decidido con las reservas RECIÉN TRAÍDAS del servidor
 * (nunca con la copia guardada de la pantalla: con ella, una oferta abierta
 * mientras la app estaba en segundo plano no se ve, y se le decía «ya no está
 * disponible» con la plaza esperándola).
 * - `aceptar`: la oferta sigue viva → se acepta (es lo que pulsó).
 * - `confirmar-cancelar`: salir de la lista o «no puedo ir» → se abre SU confirmación.
 * - `aviso`: no hay nada que hacer, y se le dice por qué.
 */
export function decidirOrdenAviso(
  orden: AccionPendiente,
  reservas: { id: string; claseId: string; estado: string; ofertaExpiraEn?: string | null }[],
  ahoraMs: number,
): { tipo: 'aceptar'; reservaId: string } | { tipo: 'confirmar-cancelar'; reservaId: string } | { tipo: 'aviso'; texto: string } {
  const suyas = reservas.filter((r) => r.claseId === orden.sesionId);
  const confirmada = suyas.find((r) => r.estado === 'confirmada');
  if (orden.tipo === 'no-puedo-ir') {
    return confirmada ? { tipo: 'confirmar-cancelar', reservaId: confirmada.id } : { tipo: 'aviso', texto: 'Ya no tienes reserva en esa clase.' };
  }
  const oferta = suyas.find((r) => r.estado === 'en-espera' && !!r.ofertaExpiraEn && new Date(r.ofertaExpiraEn).getTime() > ahoraMs);
  if (oferta) return orden.tipo === 'aceptar-oferta' ? { tipo: 'aceptar', reservaId: oferta.id } : { tipo: 'confirmar-cancelar', reservaId: oferta.id };
  if (confirmada) return { tipo: 'aviso', texto: 'Ya tienes plaza en esa clase.' };
  return { tipo: 'aviso', texto: 'Esa plaza ya no está disponible.' };
}
