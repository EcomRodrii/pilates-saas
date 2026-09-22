'use client';

// Las clases fijas que ofrece el estudio y sus peticiones, desde la app de la alumna.
// Mismo contrato que el resto de llamadas de la app: nunca lanza. `null` = no se ha
// podido saber (sin red, error, o una respuesta con otra forma): la pantalla lo dice
// y deja reintentar, no pinta «tu estudio no tiene clases fijas» cuando lo que pasa
// es que no ha cargado.

import { portalAuthHeader } from '@/lib/api-client';
import { invalidarCatalogo } from '@/lib/student/catalogo';
import type { CatalogoClasesFijas } from '@/lib/clases-fijas-reglas';
import { anularPeticionPlazaFija } from '@/lib/student/plaza-fija-peticion';

export async function pedirCatalogoClasesFijas(slug: string): Promise<CatalogoClasesFijas | null> {
  try {
    const auth = await portalAuthHeader();
    const res = await fetch('/api/public/clases-fijas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ slug }),
    });
    if (!res.ok) return null;
    const d = (await res.json().catch(() => null)) as Partial<CatalogoClasesFijas> | null;
    if (!d || !Array.isArray(d.ofertas)) return null;
    return { ofertas: d.ofertas, pedidas: Array.isArray(d.pedidas) ? d.pedidas : [] };
  } catch {
    return null;
  }
}

export type ResultadoPedirClaseFija =
  | { ok: true; solicitudId: string | null; /** Aprobación automática: ya está dada, no queda en pendiente. */ resuelta: boolean; mensaje: string | null }
  | { ok: false; error: string; sesionCaducada?: boolean };

async function pedir(ruta: 'solicitar_clase_fija' | 'ampliar_clase_fija', slug: string, studioId: string, claseFijaId: string, duracionMeses: number): Promise<ResultadoPedirClaseFija> {
  try {
    const auth = await portalAuthHeader();
    const res = await fetch('/api/public/plaza-fija', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ accion: ruta, studioId, claseFijaId, duracionMeses }),
    });
    if (res.status === 401) return { ok: false, error: 'Tu sesión ha caducado: vuelve a entrar para pedirla.', sesionCaducada: true };
    const d = (await res.json().catch(() => null)) as { solicitudId?: unknown; resuelta?: unknown; mensaje?: unknown; error?: unknown } | null;
    if (!res.ok) return { ok: false, error: typeof d?.error === 'string' && d.error ? d.error : 'No se ha podido enviar. Inténtalo de nuevo.' };
    invalidarCatalogo(slug);
    return {
      ok: true, solicitudId: typeof d?.solicitudId === 'string' ? d.solicitudId : null,
      resuelta: d?.resuelta === true, mensaje: typeof d?.mensaje === 'string' ? d.mensaje : null,
    };
  } catch {
    return { ok: false, error: 'Sin conexión: no sabemos si se ha enviado. Comprueba tu conexión y vuelve a mirar.' };
  }
}

/** Pide una clase fija con la duración elegida. Solo dice que sí si el servidor lo dice. */
export const pedirClaseFija = (slug: string, studioId: string, claseFijaId: string, duracionMeses: number) =>
  pedir('solicitar_clase_fija', slug, studioId, claseFijaId, duracionMeses);

/** Pide ampliar una clase fija que ya tiene, antes de que venza. Mismo contrato que pedirla. */
export const ampliarClaseFija = (slug: string, studioId: string, claseFijaId: string, duracionMeses: number) =>
  pedir('ampliar_clase_fija', slug, studioId, claseFijaId, duracionMeses);

/** Anular una petición pendiente es lo mismo que anular la de una plaza fija: una petición, por su id. */
export const anularPeticionClaseFija = anularPeticionPlazaFija;
