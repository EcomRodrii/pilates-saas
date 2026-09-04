'use client';

// Notificaciones, preferencias y datos personales.
//
// Las tres cosas que la alumna puede CAMBIAR de sí misma, y las tres tienen su
// endpoint ya escrito. Aquí solo se traduce.

import { portalAuthHeader } from '@/lib/api-client';
import { invalidarCatalogo } from '@/lib/student/catalogo';
import type { Notificacion } from '@/lib/student/tipos';
import { traducirEnlace } from '@/lib/student/deep-links';
import { tipoDeAviso } from '@/lib/student/tipo-aviso';

// ── Notificaciones ──────────────────────────────────────────────────────────

/**
 * Fila cruda del motor de notificaciones.
 *
 * ⚠️ La ruta serializa en camelCase (`readAt`, `createdAt`, `deepLink`), no en
 * el snake_case de la tabla. Este adaptador leía las columnas y no las claves,
 * y como en TypeScript leer un campo ausente es `undefined` —no un error—
 * fallaba en silencio y en tres sitios a la vez:
 *
 *   · `read_at`     → toda notificación salía SIN LEER, y el contador de la
 *                     cabecera decía 5 donde el servidor decía 4.
 *   · `created_at`  → caía en el `new Date()` de reserva, así que TODAS ponían
 *                     «hace 1 min», incluida una de hace cuatro días.
 *   · `deep_link`   → ningún aviso llevaba a ninguna parte: la razón de ser de
 *                     una notificación, perdida.
 *
 * Se aceptan las dos formas: la camelCase real y el snake_case por si algún día
 * la ruta devuelve la fila en crudo.
 */
interface FilaNotificacion {
  id: string;
  title?: string | null;
  body?: string | null;
  category?: string | null;
  eventType?: string | null;
  deepLink?: string | null;
  readAt?: string | null;
  createdAt?: string | null;
  deep_link?: string | null;
  read_at?: string | null;
  created_at?: string | null;
}

// El tipo del diseño sale de `tipoDeAviso` (lib/student/tipo-aviso.ts, puro y
// con tests): primero por EVENTO, después por categoría.

export { traducirEnlace } from '@/lib/student/deep-links';

export async function getNotificaciones(slug: string, studioId: string): Promise<Notificacion[]> {
  try {
    const auth = await portalAuthHeader();
    const url = `/api/notifications?ambito=socia&studioId=${encodeURIComponent(studioId)}`;
    const res = await fetch(url, { headers: auth });
    if (!res.ok) return [];
    // ⚠️ La clave es `items`, NO `notifications`.
    //
    // Se leía `cuerpo.notifications`, que esta ruta no devuelve nunca: responde
    // `{ items, unread }`. El resultado era `undefined ?? []`, así que la
    // pantalla enseñaba «Todo al día» SIEMPRE, con avisos sin leer en la base.
    // No fallaba ni avisaba: mentía. Se vio comparando el render contra el
    // paquete —que ahí sí lista avisos—; en el código no se ve, porque leer una
    // clave que no existe es un `undefined` perfectamente legal.
    const cuerpo = (await res.json()) as { items?: FilaNotificacion[]; notifications?: FilaNotificacion[] } | FilaNotificacion[];
    const filas = Array.isArray(cuerpo) ? cuerpo : (cuerpo.items ?? cuerpo.notifications ?? []);
    return filas.map((n) => ({
      id: n.id,
      tipo: tipoDeAviso(n.eventType, n.category),
      titulo: n.title ?? '',
      cuerpo: n.body ?? '',
      fecha: n.createdAt ?? n.created_at ?? new Date().toISOString(),
      leida: Boolean(n.readAt ?? n.read_at),
      enlace: traducirEnlace(n.deepLink ?? n.deep_link, slug),
    }));
  } catch {
    return [];
  }
}

/** Marca una notificación —o todas— como leídas. */
export async function marcarLeidas(studioId: string, id?: string): Promise<boolean> {
  try {
    const auth = await portalAuthHeader();
    const res = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ action: id ? 'read' : 'read-all', id, ambito: 'socia', studioId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Preferencias de aviso ───────────────────────────────────────────────────

/**
 * Las categorías que el motor reconoce para una socia
 * (`CATEGORIAS_POR_ROL.SOCIA`). No se inventa ninguna.
 */
export const CATEGORIAS_SOCIA = ['reservas', 'clases', 'pagos', 'marketing'] as const;
export type CategoriaSocia = (typeof CATEGORIAS_SOCIA)[number];

export interface PreferenciaCategoria {
  category: string;
  inapp: boolean;
  push: boolean;
  email: boolean;
}

/**
 * Ausencia de fila = valores por defecto (in-app + push encendidos).
 *
 * ⚠️ La ruta devuelve `{ prefs: { [categoria]: {inapp, push, email, …} } }` —
 * un OBJETO indexado por categoría, no una lista, y bajo la clave `prefs`, no
 * `preferences`. Se leía `cuerpo.preferences` como array: siempre `[]`, así que
 * la pantalla de preferencias pintaba los valores por defecto aunque la alumna
 * hubiera apagado algo. Mismo patrón que el de `items` de arriba: dos contratos
 * escritos por separado que nadie llegó a cruzar.
 */
export async function getPreferencias(): Promise<PreferenciaCategoria[]> {
  try {
    const auth = await portalAuthHeader();
    const res = await fetch('/api/notifications/preferences', { headers: auth });
    if (!res.ok) return [];
    const cuerpo = (await res.json()) as
      | { prefs?: Record<string, { inapp?: boolean; push?: boolean; email?: boolean }> }
      | PreferenciaCategoria[];
    if (Array.isArray(cuerpo)) return cuerpo;
    return Object.entries(cuerpo.prefs ?? {}).map(([category, v]) => ({
      category,
      inapp: v?.inapp ?? true,
      push: v?.push ?? true,
      email: v?.email ?? false,
    }));
  } catch {
    return [];
  }
}

/**
 * ⚠️ `studioId` es OBLIGATORIO: la ruta responde 400 «faltan datos» sin él, y
 * se estaba mandando sin. Guardar una preferencia fallaba en silencio —
 * `res.ok` era false y la pantalla revertía el interruptor sin decir por qué.
 */
export async function guardarPreferencia(p: { studioId: string; category: string; inapp?: boolean; push?: boolean; email?: boolean }): Promise<boolean> {
  try {
    const auth = await portalAuthHeader();
    const res = await fetch('/api/notifications/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify(p),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Datos personales ────────────────────────────────────────────────────────

export type ResultadoGuardar = { ok: true } | { ok: false; error: string };

/**
 * Guarda los datos que la alumna puede cambiar.
 *
 * ⚠️ El EMAIL no está: `actualizarSociaPublica` lo rechaza por escrito porque
 * cambiarlo exigiría sincronizarlo con Supabase Auth y su propio flujo de
 * confirmación, que no existe. La pantalla lo enseña bloqueado y dice por qué,
 * en vez de aceptarlo y tirarlo en silencio.
 */
export async function guardarDatos(
  studioId: string, slug: string,
  cambios: { nombre?: string; apellidos?: string; telefono?: string; direccion?: string },
): Promise<ResultadoGuardar> {
  try {
    const auth = await portalAuthHeader();
    const res = await fetch('/api/public/socio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      // ⚠️ SIN `id`. El servidor resuelve de quién es la ficha con
      // `socioAutenticado(user.userId, studioId)` e IGNORA el `id` del cuerpo —
      // comprobado atacándolo: mandar el id de otra socia devuelve 200 y edita
      // la propia, no la ajena. Mandarlo igualmente sería dejar en el código un
      // parámetro que parece que decide algo, y es una invitación a que alguien
      // "arregle" el servidor para hacerle caso.
      body: JSON.stringify({ accion: 'actualizar', studioId, cambios }),
    });
    const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) return { ok: false, error: cuerpo?.error ?? 'No hemos podido guardar tus datos.' };
    invalidarCatalogo(slug);
    return { ok: true };
  } catch {
    return { ok: false, error: 'No hemos podido guardar. Comprueba tu conexión.' };
  }
}
