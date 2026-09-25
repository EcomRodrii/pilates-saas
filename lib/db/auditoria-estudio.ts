// Lectura del libro `auditoria_estudio` desde el navegador. La cerradura es la
// RLS (solo la propietaria del estudio, migración 20260925152253): esto no
// filtra permisos, solo pide páginas. Un rol sin acceso recibe una lista vacía,
// no un error — por eso la vista tampoco se enseña a quien no puede leerla.

import { supabase } from '@/lib/db/supabase';
import { entradaDeFila, type EntradaAuditoria, type FilaAuditoria } from '@/lib/auditoria-estudio';

export const POR_PAGINA = 50;

const COLUMNAS =
  'id, studio_id, ocurrido_en, actor_uid, actor_rol, origen, tabla, fila_id, operacion, socio_id, cambios, motivo, contexto, antes, despues';

export interface PeticionAuditoria {
  studioId: string;
  /** Solo lo de una clienta (su ficha). */
  socioId?: string;
  /** Solo una tabla (el filtro de la pestaña). */
  tabla?: string;
  /** Página siguiente: las entradas con id MENOR que este. */
  antesDeId?: number;
}

export type ResultadoAuditoria =
  | { ok: true; entradas: EntradaAuditoria[]; hayMas: boolean }
  | { ok: false; error: string };

export async function cargarAuditoriaEstudio(p: PeticionAuditoria): Promise<ResultadoAuditoria> {
  let q = supabase
    .from('auditoria_estudio')
    .select(COLUMNAS)
    .eq('studio_id', p.studioId)
    // Por id y no por fecha: varias filas de un mismo cambio comparten `now()`
    // y una página cortada por fecha podría saltarse alguna.
    .order('id', { ascending: false })
    .limit(POR_PAGINA + 1);
  if (p.socioId) q = q.eq('socio_id', p.socioId);
  if (p.tabla) q = q.eq('tabla', p.tabla);
  if (p.antesDeId !== undefined) q = q.lt('id', p.antesDeId);

  const { data, error } = await q;
  if (error) return { ok: false, error: 'No se ha podido cargar el historial.' };
  const filas = (data ?? []) as FilaAuditoria[];
  const entradas = filas
    .slice(0, POR_PAGINA)
    .map(entradaDeFila)
    .filter((e): e is EntradaAuditoria => e !== null);
  return { ok: true, entradas, hayMas: filas.length > POR_PAGINA };
}
