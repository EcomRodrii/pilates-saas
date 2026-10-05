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
