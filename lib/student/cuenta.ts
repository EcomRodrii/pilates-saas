'use client';

// «Borrar mi cuenta de Tentare», lado cliente. Dice lo que respondió el SERVIDOR:
// solo es «borrada» si la respuesta es 2xx Y trae `borrada: true`. Un 4xx/5xx,
// un cuerpo raro o la red caída nunca se leen como borrada.

import { portalAuthHeader } from '@/lib/student/api-publica';

export type ResultadoBorrarCuenta = { ok: true } | { ok: false; error: string };

export async function borrarCuentaTentare(confirmacion: string): Promise<ResultadoBorrarCuenta> {
  try {
    const res = await fetch('/api/public/cuenta/borrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
      body: JSON.stringify({ confirmacion }),
    });
    const d = (await res.json().catch(() => null)) as { borrada?: unknown; error?: unknown } | null;
    if (res.ok && d?.borrada === true) return { ok: true };
    if (res.status === 429) return { ok: false, error: 'Has hecho demasiados intentos. Espera unos minutos.' };
    if (res.status === 401) return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar e inténtalo de nuevo.' };
    const error = typeof d?.error === 'string' && d.error ? d.error : 'No hemos podido borrar tu cuenta. Inténtalo de nuevo.';
    return { ok: false, error };
  } catch {
    return { ok: false, error: 'Sin conexión. No se ha borrado nada: inténtalo de nuevo.' };
  }
}
