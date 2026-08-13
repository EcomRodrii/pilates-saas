import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';

export const runtime = 'nodejs';

// Moderación de perfiles de Tentare Network — docs/NETWORK-IMPLEMENTATION-
// PLAN.md §10. Cruza el perfil de CUALQUIER persona con service-role, y eso
// solo es legítimo porque exigirPermiso ya comprobó que quien pregunta es
// del equipo interno de Tentare — mismo criterio que el resto de /interno.
export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'network.moderate');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  const estado = req.nextUrl.searchParams.get('estado');

  let query = db
    .from('red_perfiles')
    .select('id, nombre, ciudad, estado, destacado, creado_en, actualizado_en, ultimo_acceso_en')
    .order('creado_en', { ascending: false })
    .limit(500);
  if (q) query = query.ilike('nombre', `%${q}%`);
  if (estado) query = query.eq('estado', estado);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'No se han podido cargar los perfiles.' }, { status: 500 });

  return NextResponse.json({ perfiles: data ?? [] });
}

const ESTADOS_VALIDOS = new Set(['draft', 'published', 'hidden', 'suspended']);

// La moderación puede poner CUALQUIER estado, incluido `suspended` — la RLS
// (20260813112713) bloquea justo esto para el dueño del perfil, no para
// service-role. Restaurar es el mismo endpoint con estado='published'.
//
// `destacado` es un campo aparte, no un estado más: una decisión editorial
// del equipo de Tentare (empuja al principio del ranking, lib/network/
// ranking.ts) que puede cambiar con independencia de si el perfil está
// publicado o no — se admite en el mismo PATCH para no duplicar el
// endpoint, pero `estado` sigue siendo opcional cuando solo se toca esto.
export async function PATCH(req: NextRequest) {
  const g = await exigirPermiso(req, 'network.moderate');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { id?: unknown; estado?: unknown; destacado?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : null;
  const estado = typeof body?.estado === 'string' ? body.estado : undefined;
  const destacado = typeof body?.destacado === 'boolean' ? body.destacado : undefined;
  if (!id || (estado === undefined && destacado === undefined) || (estado !== undefined && !ESTADOS_VALIDOS.has(estado))) {
    return NextResponse.json({ error: 'Datos no válidos.' }, { status: 400 });
  }

  const cambios: Record<string, unknown> = { actualizado_en: new Date().toISOString() };
  if (estado !== undefined) cambios.estado = estado;
  if (destacado !== undefined) cambios.destacado = destacado;

  const { error } = await db.from('red_perfiles').update(cambios).eq('id', id);
  if (error) return NextResponse.json({ error: 'No se ha podido actualizar el perfil.' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
