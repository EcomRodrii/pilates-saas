'use client';

import { portalAuthHeader } from '@/lib/student/api-publica';
import { esRutaDeResenas, leerPremio, type PremioResena } from '@/lib/valoraciones/premio';

// Valorar una clase desde la app. Contra `/api/public/valorar-clase`, que es
// quien decide si se puede (solo tras ASISTIDA) — aquí solo se traduce.

export interface EstadoValoracion {
  puedeValorar: boolean;
  motivo: 'sin-reserva' | 'no-asistida' | null;
  valoracion: { puntuacion: number; comentario: string | null } | null;
}

export async function getValoracionClase(studioId: string, sesionId: string): Promise<EstadoValoracion | null> {
  try {
    const auth = await portalAuthHeader();
    const url = `/api/public/valorar-clase?studioId=${encodeURIComponent(studioId)}&sesionId=${encodeURIComponent(sesionId)}`;
    const res = await fetch(url, { headers: auth });
    if (!res.ok) return null;
    return (await res.json()) as EstadoValoracion;
  } catch {
    return null;
  }
}

/** Lo que el servidor añade a una valoración: el premio (si el estudio lo ofrece) y su enlace de reseñas. */
export interface ExtrasValoracion { premio?: PremioResena; enlaceResenas?: string }

export type ResultadoValorar = ({ ok: true; actualizada: boolean; yaValorada: boolean } & ExtrasValoracion) | { ok: false; error: string };

export async function enviarValoracion(
  studioId: string, sesionId: string, puntuacion: number, comentario: string,
  /** Solo crear: si ya estaba valorada, el servidor no pisa nada y contesta `yaValorada`. */
  opciones: { soloSiNueva?: boolean } = {},
): Promise<ResultadoValorar> {
  try {
    const auth = await portalAuthHeader();
    const res = await fetch('/api/public/valorar-clase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ studioId, sesionId, puntuacion, comentario: comentario.trim() || null, ...(opciones.soloSiNueva ? { soloSiNueva: true } : {}) }),
    });
    const cuerpo = (await res.json().catch(() => null)) as { ok?: boolean; actualizada?: boolean; yaValorada?: boolean; error?: string; premio?: unknown; enlaceResenas?: unknown } | null;
    if (!res.ok || !cuerpo?.ok) return { ok: false, error: cuerpo?.error ?? 'No se ha podido enviar tu valoración.' };
    const premio = leerPremio(cuerpo.premio);
    // Solo la ruta con seguimiento de ESTA app se pinta como enlace (el servidor ya la filtra; aquí, por si acaso).
    const enlaceResenas = esRutaDeResenas(cuerpo.enlaceResenas) ? cuerpo.enlaceResenas : undefined;
    return { ok: true, actualizada: cuerpo.actualizada === true, yaValorada: cuerpo.yaValorada === true, ...(premio ? { premio } : {}), ...(enlaceResenas ? { enlaceResenas } : {}) };
  } catch {
    return { ok: false, error: 'Sin conexión. Inténtalo de nuevo.' };
  }
}

/** La clase que puede valorar AHORA en Inicio («¿Qué tal la clase?»). */
export interface ValoracionPendiente { sesionId: string; fin: string; clase: string; instructora: string | null }

/**
 * La pide al servidor (`?pendiente=1`) porque el catálogo de la app no trae las
 * clases ya terminadas. `null` si no hay ninguna o si algo falla: la tarjeta no
 * se pinta, que es lo de antes.
 */
export async function getValoracionPendiente(studioId: string): Promise<ValoracionPendiente | null> {
  try {
    const auth = await portalAuthHeader();
    const res = await fetch(`/api/public/valorar-clase?studioId=${encodeURIComponent(studioId)}&pendiente=1`, { headers: auth });
    if (!res.ok) return null;
    const cuerpo = (await res.json().catch(() => null)) as { pendiente?: ValoracionPendiente | null } | null;
    const p = cuerpo?.pendiente;
    return p && typeof p.sesionId === 'string' && typeof p.fin === 'string' && typeof p.clase === 'string' ? p : null;
  } catch {
    return null;
  }
}
