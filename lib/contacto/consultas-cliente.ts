'use client';

// Consultas del formulario de contacto, lado PANEL (Clientas). Directo contra
// Supabase con la sesión de quien opera: la RLS de `consultas_contacto` es la
// cerradura (solo PROPIETARIO, MANAGER y RECEPCION de su sede), no esto.
//
// ⚠️ Un UPDATE o DELETE que la RLS no deja pasar NO da error: afecta a 0 filas.
// Por eso cada escritura pide `.select('id')` y solo dice «hecho» si vuelve la
// fila. Si no, lo que se pinta es un error, nunca un éxito.

import { supabase } from '@/lib/db/supabase';
import { authHeader } from '@/lib/api-client';
import { CANALES_CONSULTA_MANUAL, type CanalConsulta } from '@/lib/contacto/consulta';

export interface ConsultaContacto {
  id: string;
  nombre: string;
  /** null en las apuntadas a mano con solo teléfono. */
  email: string | null;
  telefono: string | null;
  mensaje: string;
  origen: string | null;
  /** De dónde vino: el formulario de la web, o lo que dijo quien la apuntó a mano. */
  canal: CanalConsulta;
  estado: 'nueva' | 'atendida' | 'descartada';
  creadaEn: string;
  atendidaEn: string | null;
}

export type Resultado = { ok: true } | { ok: false; error: string };

const COLUMNAS = 'id, nombre, email, telefono, mensaje, origen, canal, estado, creada_en, atendida_en';
const CANALES = new Set<string>(['FORMULARIO', ...CANALES_CONSULTA_MANUAL]);
/** Lo que se ve de las ya atendidas: las de los últimos 90 días (luego las purga el cron). */
const ATENDIDAS_MAX = 50;

// Las apuntadas a mano pueden venir sin email (solo teléfono): esas también valen.
function aConsulta(f: Record<string, unknown>): ConsultaContacto | null {
  if (typeof f.id !== 'string' || typeof f.mensaje !== 'string') return null;
  const email = typeof f.email === 'string' ? f.email : null;
  const telefono = typeof f.telefono === 'string' ? f.telefono : null;
  if (!email && !telefono) return null;
  return {
    id: f.id,
    nombre: typeof f.nombre === 'string' ? f.nombre : '',
    email,
    telefono,
    mensaje: f.mensaje,
    origen: typeof f.origen === 'string' ? f.origen : null,
    canal: typeof f.canal === 'string' && CANALES.has(f.canal) ? f.canal as CanalConsulta : 'FORMULARIO',
    estado: f.estado === 'atendida' ? 'atendida' : f.estado === 'descartada' ? 'descartada' : 'nueva',
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
    if (data && data.length === 1) return { ok: true };
    // Cero filas no es siempre un fallo. Al dar de alta la ficha con el mismo
    // email, la base de datos ya la ha cerrado y enlazado (trigger
    // `socios_vincula_consulta`), y la RLS no deja tocar una enlazada: el alta
    // desde una consulta decía «sigue como nueva» justo cuando ya no lo estaba.
    // Y otra persona puede haberla atendido mientras tanto. Se mira cómo está.
    const { data: actual, error: errorLeer } = await supabase.from('consultas_contacto')
      .select('estado').eq('id', id).maybeSingle();
    if (!errorLeer && actual?.estado === 'atendida') return { ok: true };
    if (!errorLeer && actual?.estado === 'descartada') return { ok: false, error: 'Otra persona la había descartado.' };
    return { ok: false, error: 'No se ha podido marcar como atendida. Recarga la página por si ya lo hizo otra persona.' };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

/** No le interesa, o era spam: sale de «Interesadas» (se purga a los 90 días). */
export async function descartarConsulta(id: string, authUserId: string): Promise<Resultado> {
  try {
    const { data, error } = await supabase.from('consultas_contacto')
      .update({ estado: 'descartada', descartada_en: new Date().toISOString(), descartada_por: authUserId })
      .eq('id', id).eq('estado', 'nueva')
      .select('id');
    if (error) return { ok: false, error: 'No se ha podido descartar.' };
    if (!data || data.length !== 1) return { ok: false, error: 'No se ha podido descartar. Recarga la página por si ya lo hizo otra persona.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

/** Apuntar a mano a una interesada (lo guarda el servidor: app/api/consultas). */
export async function apuntarInteresada(datos: {
  nombre: string; email: string | null; telefono: string | null; canal: string; mensaje: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string; socioId?: string }> {
  try {
    const res = await fetch('/api/consultas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(datos),
    });
    const cuerpo = await res.json().catch(() => null) as { id?: string; error?: string; socioId?: string } | null;
    if (res.status === 201 && typeof cuerpo?.id === 'string') return { ok: true, id: cuerpo.id };
    return { ok: false, error: cuerpo?.error ?? 'No se ha podido apuntar. Vuelve a intentarlo.', socioId: cuerpo?.socioId };
  } catch {
    return { ok: false, error: 'Sin conexión: no se ha apuntado. Vuelve a intentarlo.' };
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
