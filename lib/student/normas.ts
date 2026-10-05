'use client';

import { portalAuthHeader } from '@/lib/student/api-publica';
import { mensajeSeguro } from '@/lib/errores';
import { VERSION_NORMAS } from '@/lib/moderacion/normas';

// Aceptar las normas de la comunidad (App Store 1.2). Lo pide la pantalla
// cuando el servidor contesta `NORMAS_PENDIENTES` al escribir; quien decide si
// hacen falta es el servidor, no esta función.

export type ResultadoNormas = { ok: true } | { ok: false; error: string };

export async function aceptarNormasComunidad(): Promise<ResultadoNormas> {
  try {
    const auth = await portalAuthHeader();
    const res = await fetch('/api/public/normas-comunidad', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ version: VERSION_NORMAS }),
    });
    if (res.ok) return { ok: true };
    const cuerpo = await res.json().catch(() => null) as { error?: string } | null;
    return { ok: false, error: mensajeSeguro(cuerpo?.error, 'No se han podido guardar. Inténtalo otra vez.') };
  } catch {
    return { ok: false, error: 'Sin conexión. Inténtalo de nuevo.' };
  }
}
