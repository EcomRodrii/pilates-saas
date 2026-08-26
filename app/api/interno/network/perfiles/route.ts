import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { slugBase, slugConSufijo } from '@/lib/network/slug';
import { escaparLike } from '@/lib/escapar-like';

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
  if (q) query = query.ilike('nombre', `%${escaparLike(q)}%`);
  if (estado) query = query.eq('estado', estado);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'No se han podido cargar los perfiles.' }, { status: 500 });

  return NextResponse.json({ perfiles: data ?? [] });
}

const ESTADOS_VALIDOS = new Set(['draft', 'en_revision', 'published', 'hidden', 'suspended']);

// La moderación puede poner CUALQUIER estado, incluido `published` y
// `suspended` — la RLS (red_perfiles_en_revision, antes 20260813112713)
// bloquea justo estos dos para el dueño del perfil, no para service-role.
// Restaurar es el mismo endpoint con estado='published'. "Aprobar" desde la
// cola de revisión (estado='en_revision' → 'published') es el mismo botón,
// sin acción aparte: no hay dos formas de publicar un perfil.
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

  // Slug: se genera una sola vez, la primera vez que un perfil se vuelve
  // 'published' de verdad (nunca desde el endpoint del dueño — ver el
  // comentario de app/api/network/perfil/estado/route.ts) — nunca se
  // regenera después, para que un enlace ya compartido/indexado no se
  // rompa si cambia el nombre o la ciudad más tarde.
  if (estado === 'published') {
    const { data: fila } = await db.from('red_perfiles').select('nombre, ciudad, slug').eq('id', id).maybeSingle();
    if (fila && !fila.slug) {
      const base = slugBase(fila.nombre as string, fila.ciudad as string | null);
      let slug: string | null = base;
      for (let intento = 1; intento <= 20; intento++) {
        const candidato = slugConSufijo(base, intento);
        const { data: choque } = await db.from('red_perfiles').select('id').eq('slug', candidato).maybeSingle();
        if (!choque) { slug = candidato; break; }
        slug = null;
      }
      cambios.slug = slug ?? id;
    }
  }

  const { error } = await db.from('red_perfiles').update(cambios).eq('id', id);
  if (error) return NextResponse.json({ error: 'No se ha podido actualizar el perfil.' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
