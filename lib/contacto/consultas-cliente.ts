'use client';

// Consultas del formulario de contacto, lado PANEL (Clientas). Directo contra
// Supabase con la sesión de quien opera: la RLS de `consultas_contacto` es la
// cerradura (solo PROPIETARIO, MANAGER y RECEPCION de su sede), no esto.
//
// ⚠️ Un UPDATE o DELETE que la RLS no deja pasar NO da error: afecta a 0 filas.
// Por eso cada escritura pide `.select('id')` y solo dice «hecho» si vuelve la
// fila. Si no, lo que se pinta es un error, nunca un éxito.

import { supabase } from '@/lib/db/supabase';

export interface ConsultaContacto {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  mensaje: string;
  origen: string | null;
  estado: 'nueva' | 'atendida';
  creadaEn: string;
  atendidaEn: string | null;
}

export type Resultado = { ok: true } | { ok: false; error: string };

const COLUMNAS = 'id, nombre, email, telefono, mensaje, origen, estado, creada_en, atendida_en';
/** Lo que se ve de las ya atendidas: las de los últimos 90 días (luego las purga el cron). */
const ATENDIDAS_MAX = 50;

function aConsulta(f: Record<string, unknown>): ConsultaContacto | null {
  if (typeof f.id !== 'string' || typeof f.email !== 'string' || typeof f.mensaje !== 'string') return null;
  return {
    id: f.id,
    nombre: typeof f.nombre === 'string' ? f.nombre : '',
    email: f.email,
    telefono: typeof f.telefono === 'string' ? f.telefono : null,
    mensaje: f.mensaje,
    origen: typeof f.origen === 'string' ? f.origen : null,
    estado: f.estado === 'atendida' ? 'atendida' : 'nueva',
    creadaEn: typeof f.creada_en === 'string' ? f.creada_en : '',
    atendidaEn: typeof f.atendida_en === 'string' ? f.atendida_en : null,
  };
}

/** `null` = no se pudo cargar (la tarjeta lo dice; no pinta «ninguna»). */
export async function listarConsultas(studioId: string, estado: 'nueva' | 'atendida'): Promise<ConsultaContacto[] | null> {
  try {
    let q = supabase.from('consultas_contacto').select(COLUMNAS)
      .eq('studio_id', studioId).eq('estado', estado);
    q = estado === 'nueva'
      ? q.order('creada_en', { ascending: true })
      : q.order('atendida_en', { ascending: false }).limit(ATENDIDAS_MAX);
    const { data, error } = await q;
    if (error || !Array.isArray(data)) return null;
    return data.map(f => aConsulta(f as Record<string, unknown>)).filter((c): c is ConsultaContacto => c !== null);
  } catch {
    return null;
  }
}

export async function marcarAtendida(id: string, authUserId: string): Promise<Resultado> {
  try {
    const { data, error } = await supabase.from('consultas_contacto')
      .update({ estado: 'atendida', atendida_en: new Date().toISOString(), atendida_por: authUserId })
      .eq('id', id).eq('estado', 'nueva')
      .select('id');
    if (error) return { ok: false, error: 'No se ha podido marcar como atendida.' };
    if (!data || data.length !== 1) return { ok: false, error: 'No se ha podido marcar como atendida. Recarga la página por si ya lo hizo otra persona.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function eliminarConsulta(id: string): Promise<Resultado> {
  try {
    const { data, error } = await supabase.from('consultas_contacto').delete().eq('id', id).select('id');
    if (error) return { ok: false, error: 'No se ha podido eliminar la consulta.' };
    if (!data || data.length !== 1) return { ok: false, error: 'No se ha podido eliminar la consulta. Recarga la página.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

/** Cuántas atendidas hay (para ofrecer verlas aunque no quede ninguna nueva). `null` = no se pudo contar. */
export async function contarAtendidas(studioId: string): Promise<number | null> {
  try {
    const { count, error } = await supabase.from('consultas_contacto')
      .select('id', { count: 'exact', head: true })
      .eq('studio_id', studioId).eq('estado', 'atendida');
    return error ? null : (count ?? 0);
  } catch {
    return null;
  }
}
