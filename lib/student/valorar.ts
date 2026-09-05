'use client';

import { portalAuthHeader } from '@/lib/api-client';

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

export type ResultadoValorar = { ok: true; actualizada: boolean } | { ok: false; error: string };

export async function enviarValoracion(
  studioId: string, sesionId: string, puntuacion: number, comentario: string,
): Promise<ResultadoValorar> {
  try {
    const auth = await portalAuthHeader();
    const res = await fetch('/api/public/valorar-clase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ studioId, sesionId, puntuacion, comentario: comentario.trim() || null }),
    });
    const cuerpo = (await res.json().catch(() => null)) as { ok?: boolean; actualizada?: boolean; error?: string } | null;
    if (!res.ok || !cuerpo?.ok) return { ok: false, error: cuerpo?.error ?? 'No se ha podido enviar tu valoración.' };
    return { ok: true, actualizada: cuerpo.actualizada === true };
  } catch {
    return { ok: false, error: 'Sin conexión. Inténtalo de nuevo.' };
  }
}
