'use client';

// Acceso a la valoración inicial desde la app de la alumna. Delgado a
// propósito: pide y proyecta, sin lógica propia — las reglas viven en
// `lib/valoracion-inicial.ts` y las revalida el servidor.

import { portalAuthHeader } from '@/lib/api-client';
import type { Historial, Valoracion, IdPaso } from '@/lib/valoracion-inicial';

export interface EstadoValoracionRemota {
  activa: boolean;
  /** ¿Ha dado su consentimiento para la parte de salud? */
  conSalud: boolean;
  historial: Historial | null;
}

export async function getValoracion(studioId: string): Promise<EstadoValoracionRemota | null> {
  try {
    const res = await fetch(`/api/public/valoracion?studioId=${encodeURIComponent(studioId)}`, {
      headers: { ...(await portalAuthHeader()) },
    });
    if (!res.ok) return null;
    return (await res.json()) as EstadoValoracionRemota;
  } catch {
    return null;
  }
}

export type ResultadoGuardado =
  | { ok: true }
  // `falta` viaja hasta la pantalla para poder llevarla al paso que le falta,
  // en vez de dejarla delante de un botón que no responde.
  | { error: string; falta?: IdPaso[] };

async function enviar(cuerpo: Record<string, unknown>): Promise<ResultadoGuardado> {
  try {
    const res = await fetch('/api/public/valoracion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
      body: JSON.stringify(cuerpo),
    });
    const datos = (await res.json().catch(() => null)) as { error?: string; falta?: IdPaso[] } | null;
    // ⚠️ Se mira `res.ok`, no solo que la petición no lanzara. Anunciar
    // «guardado» con el servidor diciendo 400 es el bug más repetido de este
    // repo, y aquí costaría que se creyera que su valoración está entregada.
    if (!res.ok) return { error: datos?.error ?? 'No hemos podido guardar. Inténtalo de nuevo.', falta: datos?.falta };
    return { ok: true };
  } catch {
    return { error: 'No hemos podido guardar. Comprueba tu conexión.' };
  }
}

/** Guarda el borrador, sin darlo por terminado. */
export const guardarBorrador = (studioId: string, valoracion: Valoracion) =>
  enviar({ studioId, accion: 'guardar', valoracion });

/** Lo da por terminado. El servidor vuelve a comprobar que no falte nada. */
export const completarValoracion = (studioId: string, valoracion: Valoracion) =>
  enviar({ studioId, accion: 'completar', valoracion });

/**
 * Registra el consentimiento de datos de salud.
 *
 * ⚠️ NO manda el texto. La pantalla enseña el mismo que redacta
 * `textoConsentimientoSalud`, pero lo que se GUARDA como prueba lo deriva el
 * servidor: un texto legal que viaja en el cuerpo de la petición es una traza
 * que se certifica a sí misma.
 */
export const consentirSalud = (studioId: string) =>
  enviar({ studioId, accion: 'consentir-salud' });
