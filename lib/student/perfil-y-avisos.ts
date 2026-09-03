'use client';

// Notificaciones, preferencias y datos personales.
//
// Las tres cosas que la alumna puede CAMBIAR de sí misma, y las tres tienen su
// endpoint ya escrito. Aquí solo se traduce.

import { portalAuthHeader } from '@/lib/api-client';
import { invalidarCatalogo } from '@/lib/student/catalogo';
import type { Notificacion } from '@/lib/student/tipos';
import { traducirEnlace } from '@/lib/student/deep-links';

// ── Notificaciones ──────────────────────────────────────────────────────────

/** Fila cruda del motor de notificaciones. */
interface FilaNotificacion {
  id: string;
  title?: string | null;
  body?: string | null;
  category?: string | null;
  deep_link?: string | null;
  read_at?: string | null;
  created_at?: string | null;
}

/**
 * Del catálogo del motor al tipo del diseño.
 *
 * ⚠️ Los cinco tipos del diseño ('plaza-liberada', 'recordatorio', 'bono',
 * 'estudio', 'valorar') NO existen en el backend: lo que hay son CATEGORÍAS por
 * rol, y para una socia son `reservas`, `clases`, `pagos`, `marketing` y
 * `mensajeria` (lib/notifications/catalog.ts:989). Se mapean por lo que
 * significan, no por el nombre, y lo que no encaja cae en 'estudio' — que es el
 * icono neutro del diseño (📣) y no miente.
 */
function tipoDeCategoria(categoria: string | null | undefined): Notificacion['tipo'] {
  switch (categoria) {
    case 'reservas': return 'plaza-liberada';
    case 'clases': return 'recordatorio';
    case 'pagos': return 'bono';
    case 'marketing': return 'estudio';
    case 'mensajeria': return 'estudio';
    default: return 'estudio';
  }
}

export { traducirEnlace } from '@/lib/student/deep-links';

export async function getNotificaciones(slug: string, studioId: string): Promise<Notificacion[]> {
  try {
    const auth = await portalAuthHeader();
    const url = `/api/notifications?ambito=socia&studioId=${encodeURIComponent(studioId)}`;
    const res = await fetch(url, { headers: auth });
    if (!res.ok) return [];
    const cuerpo = (await res.json()) as { notifications?: FilaNotificacion[] } | FilaNotificacion[];
    const filas = Array.isArray(cuerpo) ? cuerpo : (cuerpo.notifications ?? []);
    return filas.map((n) => ({
      id: n.id,
      tipo: tipoDeCategoria(n.category),
      titulo: n.title ?? '',
      cuerpo: n.body ?? '',
      fecha: n.created_at ?? new Date().toISOString(),
      leida: Boolean(n.read_at),
      enlace: traducirEnlace(n.deep_link, slug),
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

/** Ausencia de fila = valores por defecto (in-app + push encendidos). */
export async function getPreferencias(): Promise<PreferenciaCategoria[]> {
  try {
    const auth = await portalAuthHeader();
    const res = await fetch('/api/notifications/preferences', { headers: auth });
    if (!res.ok) return [];
    const cuerpo = (await res.json()) as { preferences?: PreferenciaCategoria[] } | PreferenciaCategoria[];
    return Array.isArray(cuerpo) ? cuerpo : (cuerpo.preferences ?? []);
  } catch {
    return [];
  }
}

export async function guardarPreferencia(p: { category: string; inapp?: boolean; push?: boolean; email?: boolean }): Promise<boolean> {
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
