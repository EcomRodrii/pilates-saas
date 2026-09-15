'use client';

// Llamadas del panel a `/api/series/renovar`. Nada optimista: lo que se pinta es
// lo que devuelve el servidor, y un cuerpo con otra forma se trata como fallo.

import { authHeader } from '@/lib/api-client';
import type { ResultadoRenovarSerie, SeriePorRenovar } from '@/lib/series-renovacion';

export type RespuestaRenovar = { ok: true; resultado: ResultadoRenovarSerie } | { ok: false; error: string };

const RUTA = '/api/series/renovar';
const SIN_RED = 'No se ha podido conectar. Inténtalo de nuevo.';

async function post(cuerpo: Record<string, unknown>): Promise<{ ok: boolean; datos: Record<string, unknown> | null }> {
  const respuesta = await fetch(RUTA, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(cuerpo),
  }).catch(() => null);
  if (!respuesta) return { ok: false, datos: null };
  const datos = (await respuesta.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: respuesta.ok, datos };
}

function respuestaRenovar(r: { ok: boolean; datos: Record<string, unknown> | null }, porDefecto: string): RespuestaRenovar {
  const resultado = r.datos?.resultado as ResultadoRenovarSerie | undefined;
  if (r.ok && r.datos?.ok === true && resultado && typeof resultado.estado === 'string') return { ok: true, resultado };
  return { ok: false, error: typeof r.datos?.error === 'string' ? r.datos.error : r.datos ? porDefecto : SIN_RED };
}

/** Lo que haría renovar, sin crear nada. `semanas: null` = las del último período. */
export async function simularRenovacion(serieId: string, semanas: number | null): Promise<RespuestaRenovar> {
  return respuestaRenovar(await post({ serieId, accion: 'simular', semanas }), 'No se ha podido preparar la renovación.');
}

export async function renovarSerie(serieId: string, semanas: number, periodoVisto: number): Promise<RespuestaRenovar> {
  return respuestaRenovar(await post({ serieId, accion: 'renovar', semanas, periodoVisto }), 'No se ha podido renovar la clase.');
}

export async function marcarNoRenovar(serieId: string, noRenovar: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await post({ serieId, accion: noRenovar ? 'no_renovar' : 'reactivar' });
  if (r.ok && r.datos?.ok === true) return { ok: true };
  return { ok: false, error: typeof r.datos?.error === 'string' ? r.datos.error : SIN_RED };
}

/** `null` si no se ha podido saber (no es lo mismo que «no hay ninguna»). */
export async function listarSeriesPorRenovar(): Promise<SeriePorRenovar[] | null> {
  const respuesta = await fetch(RUTA, { headers: await authHeader() }).catch(() => null);
  if (!respuesta?.ok) return null;
  const datos = (await respuesta.json().catch(() => null)) as { ok?: boolean; series?: unknown } | null;
  return datos?.ok === true && Array.isArray(datos.series) ? (datos.series as SeriePorRenovar[]) : null;
}

/** Activa o quita la renovación automática de una serie. */
export async function marcarRenovacionAutomatica(serieId: string, activar: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await post({ serieId, accion: 'automatica', activar });
  if (r.ok && r.datos?.ok === true) return { ok: true };
  return { ok: false, error: typeof r.datos?.error === 'string' ? r.datos.error : r.datos ? 'No se ha podido guardar.' : SIN_RED };
}
