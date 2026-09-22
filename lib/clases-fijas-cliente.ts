'use client';

// Llamadas del panel a `/api/clases-fijas` (las ofertas que arma el estudio con sus
// clases que se repiten). `null` = no se ha podido saber (sin red, error del
// servidor o respuesta con otra forma): la pantalla lo dice y ofrece reintentar,
// nunca pinta «no tienes ninguna» cuando lo que pasa es que no ha cargado.

import { authHeader } from '@/lib/api-client';
import type { OfertaStaff } from '@/lib/clases-fijas-reglas';

export async function pedirClasesFijas(): Promise<OfertaStaff[] | null> {
  const respuesta = await fetch('/api/clases-fijas', { headers: await authHeader() }).catch(() => null);
  if (!respuesta?.ok) return null;
  const datos = (await respuesta.json().catch(() => null)) as { ok?: boolean; clases?: unknown } | null;
  if (!datos?.ok || !Array.isArray(datos.clases)) return null;
  return datos.clases.filter((c): c is OfertaStaff =>
    !!c && typeof (c as OfertaStaff).id === 'string' && Array.isArray((c as OfertaStaff).franjas));
}

export interface DatosClaseFija {
  nombre: string;
  descripcion: string;
  duracionesMeses: number[];
  plazas: number | null;
  franjas: { serieId: string; diaSemana: number }[];
  aprobacionAutomatica: boolean;
}

export type ResultadoGuardarClaseFija = { ok: true; id: string } | { ok: false; error: string };

async function escribir(metodo: 'POST' | 'PATCH', cuerpo: Record<string, unknown>): Promise<ResultadoGuardarClaseFija> {
  try {
    const res = await fetch('/api/clases-fijas', {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(cuerpo),
    });
    const d = await res.json().catch(() => ({})) as { ok?: boolean; id?: string; error?: string };
    if (!res.ok || !d.ok || typeof d.id !== 'string') {
      return { ok: false, error: typeof d.error === 'string' && d.error ? d.error : 'No se ha podido guardar la clase fija. Inténtalo de nuevo.' };
    }
    return { ok: true, id: d.id };
  } catch {
    return { ok: false, error: 'Sin conexión: no se ha guardado. Inténtalo de nuevo.' };
  }
}

export const crearClaseFija = (datos: DatosClaseFija) => escribir('POST', { ...datos });
export const editarClaseFija = (id: string, cambios: Partial<DatosClaseFija> & { activa?: boolean }) => escribir('PATCH', { id, ...cambios });
