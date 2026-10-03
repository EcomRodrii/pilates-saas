'use client';

// «Reservar las próximas N clases» con bono: el cliente de `/api/public/reserva-proximas`. Mismo contrato que el resto de la
// escritura de la alumna: nunca lanza, no manda `socioId` (sale del JWT) y solo invalida el catálogo si el servidor dice que sí.
// ⚠️ Lo que se pinta sale de SU respuesta, nunca del toque: ni «reservadas» ni «descontadas» antes de que lo diga.

import { invalidarCatalogo } from '@/lib/student/catalogo';
import { portalAuthHeader } from '@/lib/student/api-publica';
import { avisarFaltanPreguntas } from '@/lib/student/preguntas-alta';
import type { ResultadoOcurrencia } from '@/lib/reservas/proximas-reglas';

export interface OcurrenciaVista {
  sesionId: string; fecha: string; hora: string; resultado: ResultadoOcurrencia;
  codigo?: string; pagador?: 'bono' | 'cuota' | 'ninguno'; repetida?: boolean;
}
export interface DatosProximas {
  accion: 'previsualizar' | 'reservar'; n: number; ocurrencias: OcurrenciaVista[];
  bono: { suscripcionId: string; plan: string; saldoAntes: number; saldoDespues: number; fechaFin: string | null } | null;
  resumen: { reservadas: number; descontadas: number; pedidas: number; paro: { motivo: ResultadoOcurrencia; desdeSesionId: string } | null };
}
export type ResultadoProximas =
  | { ok: true; datos: DatosProximas }
  | { ok: false; error: string; codigo?: string; sesionCaducada?: boolean; sinConexion?: boolean };

async function enviar(cuerpo: Record<string, unknown>): Promise<ResultadoProximas> {
  try {
    const auth = await portalAuthHeader();
    const res = await fetch('/api/public/reserva-proximas', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify(cuerpo),
    });
    if (res.status === 401) return { ok: false, error: 'Tu sesión ha caducado: vuelve a entrar.', sesionCaducada: true };
    const d = (await res.json().catch(() => null)) as (Partial<DatosProximas> & { error?: unknown; codigo?: unknown }) | null;
    if (!res.ok || !d || !Array.isArray(d.ocurrencias)) {
      const codigo = typeof d?.codigo === 'string' ? d.codigo : undefined;
      if (codigo === 'faltan-preguntas') avisarFaltanPreguntas();
      return { ok: false, error: typeof d?.error === 'string' && d.error ? d.error : 'No se han podido reservar las clases. Inténtalo de nuevo.', codigo };
    }
    return { ok: true, datos: d as DatosProximas };
  } catch {
    // Falló la red: en `reservar` NO se sabe qué llegó a hacerse. Se dice la verdad e invita a mirar, no a reintentar a ciegas.
    return { ok: false, error: 'Sin conexión: no sabemos si se ha reservado alguna. Comprueba «Mis clases» antes de volver a intentarlo.', sinConexion: true };
  }
}

/** Qué se reservaría, sin escribir nada. */
export const previsualizarProximas = (studioId: string, sesionId: string, n: number) =>
  enviar({ accion: 'previsualizar', studioId, sesionId, n });

/** Reserva las N. El `intentoId` hace que un reintento del MISMO intento no duplique nada (ver `nuevoIntento`). */
export async function reservarProximas(slug: string, studioId: string, sesionId: string, n: number, intentoId: string): Promise<ResultadoProximas> {
  const r = await enviar({ accion: 'reservar', studioId, sesionId, n, intentoId });
  // Reservó algo, o no se sabe: lo que la app tenía cacheado ya no vale.
  if (r.ok || r.sinConexion) invalidarCatalogo(slug);
  return r;
}

/**
 * Un id nuevo para un INTENTO: 32 caracteres sin guiones, que nunca empiezan por `pf-`. Se renueva al abrir la hoja, al cambiar N y
 * tras cualquier respuesta COMPLETA del servidor; se CONSERVA si la red falló, para que el reintento sea una repetición.
 */
export function nuevoIntento(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID().replace(/-/g, '');
  const trozo = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  return `${Date.now().toString(36)}${trozo()}${trozo()}${trozo()}`.slice(0, 40).padEnd(16, '0');
}
