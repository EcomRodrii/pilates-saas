'use client';

// Plaza fija desde la app de la alumna: PEDIR, nunca cambiar. La plaza real no se
// toca hasta que el estudio aprueba (`/api/public/plaza-fija`, migr 20260915231920).
//
// Mismo contrato que `confirmarReserva`: nunca lanza (cualquier fallo es un
// resultado que la pantalla sabe pintar), no manda `socioId` —sale del JWT— y,
// solo si el servidor dice que sí, invalida el catálogo para que la pantalla lo vea.

import { invalidarCatalogo } from '@/lib/student/catalogo';
import { portalAuthHeader } from '@/lib/student/api-publica';
import type { Pausa } from '@/lib/plazas-fijas-pausa';

export type ResultadoPeticionPlazaFija =
  | { ok: true; solicitudId: string | null }
  | { ok: false; error: string; sesionCaducada?: boolean };

async function enviar(slug: string, cuerpo: Record<string, unknown>): Promise<ResultadoPeticionPlazaFija> {
  try {
    // ⚠️ `portalAuthHeader()` es asíncrona: sin el `await` la petición sale sin Authorization.
    const auth = await portalAuthHeader();
    const res = await fetch('/api/public/plaza-fija', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify(cuerpo),
    });
    if (res.status === 401) return { ok: false, error: 'Tu sesión ha caducado: vuelve a entrar para pedirlo.', sesionCaducada: true };
    const datos = (await res.json().catch(() => null)) as { solicitudId?: unknown; error?: unknown } | null;
    if (!res.ok) {
      // Los textos del servidor ya están escritos para ella («Ya has pedido esta plaza fija…»).
      return { ok: false, error: typeof datos?.error === 'string' && datos.error ? datos.error : 'No se ha podido enviar. Inténtalo de nuevo.' };
    }
    invalidarCatalogo(slug);
    return { ok: true, solicitudId: typeof datos?.solicitudId === 'string' ? datos.solicitudId : null };
  } catch {
    // Falló la red durante la petición: no se sabe si llegó, así que no se dice que sí.
    return { ok: false, error: 'Sin conexión: no sabemos si se ha enviado. Comprueba tu conexión y vuelve a mirar.' };
  }
}

/**
 * `duracionMeses`: cuánto tiempo la quiere (una de las cerradas); sin ella, sin fecha de fin. Va una DURACIÓN y no una fecha:
 * la fecha de fin la calcula el servidor.
 */
export const pedirPlazaFija = (slug: string, studioId: string, sesionId: string, duracionMeses?: number | null) =>
  enviar(slug, { accion: 'solicitar_plaza', studioId, sesionId, ...(duracionMeses ? { duracionMeses } : {}) });

export const pedirPausaPlazaFija = (slug: string, studioId: string, plazaId: string, pausa: Pausa) =>
  enviar(slug, { accion: 'solicitar_pausa', studioId, plazaId, desde: pausa.desde, hasta: pausa.hasta });

export const anularPeticionPlazaFija = (slug: string, studioId: string, solicitudId: string) =>
  enviar(slug, { accion: 'cancelar_peticion', studioId, solicitudId });

export type ResultadoDejarPlazaFija =
  | { ok: true; plazas: number; canceladas: number; mantenidas: number; fallidas: number; sinDejar: number }
  | { ok: false; error: string; sesionCaducada?: boolean };

/**
 * Dejar su clase fija. Mismo contrato que el resto: nunca lanza, no manda `socioId` (sale del JWT) y solo invalida el
 * catálogo si el servidor dice que sí. Lo que cambia sale de SU respuesta, nunca del toque.
 */
export async function dejarPlazaFija(slug: string, studioId: string, plazaId: string): Promise<ResultadoDejarPlazaFija> {
  try {
    const auth = await portalAuthHeader();
    const res = await fetch('/api/public/plaza-fija', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ accion: 'dejar_plaza', studioId, plazaId }),
    });
    if (res.status === 401) return { ok: false, error: 'Tu sesión ha caducado: vuelve a entrar.', sesionCaducada: true };
    const d = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) return { ok: false, error: typeof d?.error === 'string' && d.error ? d.error : 'No se ha podido dejar tu clase fija. Inténtalo de nuevo.' };
    invalidarCatalogo(slug);
    const n = (k: string) => (typeof d?.[k] === 'number' ? (d[k] as number) : 0);
    return { ok: true, plazas: n('plazas'), canceladas: n('canceladas'), mantenidas: n('mantenidas'), fallidas: n('fallidas'), sinDejar: n('sinDejar') };
  } catch {
    // Falló la red: no se sabe si llegó, así que no se dice que sí.
    return { ok: false, error: 'Sin conexión: no sabemos si se ha dejado. Comprueba tu conexión y vuelve a mirar.' };
  }
}
