// Community & Messaging OS (P1) — cliente del PORTAL de la clienta.
//
// El backend (esquema/RLS/RPC/rutas) ya está en producción; este módulo solo
// envuelve las llamadas fetch con el mismo criterio que el resto del portal
// (`portalAuthHeader`, `mensajeSeguro`/`mensajeHttp`) y aporta la única pieza
// de lógica pura de esta pantalla: qué instructoras tiene sentido ofrecer.

import type { Instructor, Reserva, Sesion } from './types.ts';
import type { RowConversaciones, RowMensajes } from './db-types.ts';
import { mensajeHttp, mensajeSeguro } from './errores.ts';

export type TipoConversacionAbrible = 'ALUMNA_INSTRUCTORA' | 'ALUMNA_MOSTRADOR';

// Mismo criterio EXACTO que la RPC `abrir_conversacion` (SIN_RELACION_VALIDA):
// una reserva de la socia en una sesión de esa instructora, en un estado que
// demuestra que hubo clase de verdad (no basta con haberla reservado y
// cancelado). Calcularlo aquí es solo para no ofrecer una lista de "prueba y
// falla" — el candado real sigue siendo la RPC, esto es UX, no seguridad.
const ESTADOS_CON_RELACION = new Set(['CONFIRMADA', 'ASISTIDA', 'NO_ASISTIO']);

export function instructorasConRelacion(
  instructores: Instructor[], reservas: Reserva[], sesiones: Sesion[], socioId: string | null,
): Instructor[] {
  if (!socioId) return [];
  const sesionPorId = new Map(sesiones.map(s => [s.id, s]));
  const idsConRelacion = new Set<string>();
  for (const r of reservas) {
    if (r.socioId !== socioId || !ESTADOS_CON_RELACION.has(r.estado)) continue;
    const sesion = sesionPorId.get(r.sesionId);
    if (sesion) idsConRelacion.add(sesion.instructorId);
  }
  return instructores.filter(i => idsConRelacion.has(i.id) && i.activo !== false);
}

// ── Llamadas a /api/public/mensajeria ───────────────────────────────────────

async function leerError(res: Response, respaldo: string): Promise<string> {
  const body = await res.json().catch(() => null) as { error?: string } | null;
  return body?.error ? mensajeSeguro(body.error, mensajeHttp(res.status)) : mensajeHttp(res.status);
}

export async function fetchConversaciones(
  headers: Record<string, string>, studioId: string,
): Promise<{ conversaciones: RowConversaciones[] } | { error: string }> {
  try {
    const res = await fetch(`/api/public/mensajeria/conversaciones?studioId=${encodeURIComponent(studioId)}`, { headers });
    if (!res.ok) return { error: await leerError(res, 'No se han podido cargar tus conversaciones.') };
    return await res.json() as { conversaciones: RowConversaciones[] };
  } catch {
    return { error: 'No hay conexión con el servidor. Comprueba tu conexión e inténtalo de nuevo.' };
  }
}

export async function abrirConversacion(
  headers: Record<string, string>, studioId: string, tipo: TipoConversacionAbrible, instructorId?: string,
): Promise<{ id: string; creada: boolean } | { error: string }> {
  try {
    const res = await fetch('/api/public/mensajeria/conversaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ studioId, tipo, instructorId }),
    });
    if (!res.ok) return { error: await leerError(res, 'No se ha podido abrir la conversación.') };
    return await res.json() as { id: string; creada: boolean };
  } catch {
    return { error: 'No hay conexión con el servidor. Comprueba tu conexión e inténtalo de nuevo.' };
  }
}

export async function fetchMensajes(
  headers: Record<string, string>, conversacionId: string, studioId: string,
): Promise<{ mensajes: RowMensajes[] } | { error: string }> {
  try {
    const url = `/api/public/mensajeria/conversaciones/${encodeURIComponent(conversacionId)}/mensajes?studioId=${encodeURIComponent(studioId)}&limite=100`;
    const res = await fetch(url, { headers });
    if (!res.ok) return { error: await leerError(res, 'No se han podido cargar los mensajes.') };
    return await res.json() as { mensajes: RowMensajes[] };
  } catch {
    return { error: 'No hay conexión con el servidor. Comprueba tu conexión e inténtalo de nuevo.' };
  }
}

export async function enviarMensaje(
  headers: Record<string, string>, conversacionId: string, studioId: string, cuerpo: string,
): Promise<{ mensaje: RowMensajes } | { error: string }> {
  try {
    const res = await fetch(`/api/public/mensajeria/conversaciones/${encodeURIComponent(conversacionId)}/mensajes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ studioId, cuerpo }),
    });
    if (!res.ok) return { error: await leerError(res, 'No se ha podido enviar el mensaje.') };
    return await res.json() as { mensaje: RowMensajes };
  } catch {
    return { error: 'No hay conexión con el servidor. Comprueba tu conexión e inténtalo de nuevo.' };
  }
}

export async function marcarConversacionLeida(
  headers: Record<string, string>, conversacionId: string, studioId: string,
): Promise<void> {
  try {
    await fetch(`/api/public/mensajeria/conversaciones/${encodeURIComponent(conversacionId)}/leido`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ studioId }),
    });
  } catch { /* best-effort: no bloquea la lectura si falla */ }
}

// ── Qué instructora hay detrás de una conversación ──────────────────────────
//
// El GET de conversaciones no devuelve quién es la instructora (la RPC no
// guarda ningún `titulo`) — enriquecerlo exigiría una ruta nueva, fuera de
// alcance de este cambio (solo UI). Lo que SÍ podemos hacer sin tocar el
// backend: recordar, en el dispositivo desde el que se abrió la conversación,
// qué instructora se eligió — así el título no se degrada a un genérico justo
// en el caso más común (la propia socia, en su propio teléfono). Si no hay
// nada guardado (otro dispositivo, o conversación ya existente de antes de
// este cambio), se cae a la etiqueta genérica "Tu instructora".
const CLAVE_INSTRUCTOR_POR_CONVERSACION = 'ps_portal_mensajeria_instructor';

function mapaInstructorPorConversacion(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CLAVE_INSTRUCTOR_POR_CONVERSACION);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : {};
  } catch { return {}; }
}

export function recordarInstructorDeConversacion(conversacionId: string, instructorId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const mapa = mapaInstructorPorConversacion();
    mapa[conversacionId] = instructorId;
    window.localStorage.setItem(CLAVE_INSTRUCTOR_POR_CONVERSACION, JSON.stringify(mapa));
  } catch { /* localStorage no disponible (Safari privado, cuota...): sin memoria, cae al genérico */ }
}

export function instructorRecordadoDe(conversacionId: string): string | null {
  return mapaInstructorPorConversacion()[conversacionId] ?? null;
}
