import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';

export const runtime = 'nodejs';

// Moderación de reseñas — toda reseña nace 'pendiente' (red_resenas, migr
// 20260813183513) y solo se ve en el perfil público una vez 'publicada'.
// Sin política SELECT para `authenticated` en la tabla — mismo criterio que
// red_reportes, solo legible aquí con service-role.
export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'network.moderate');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const estado = req.nextUrl.searchParams.get('estado') ?? 'pendiente';

  const { data, error } = await db
    .from('red_resenas')
    .select('id, puntuacion, comentario, estado, creado_en, red_perfiles ( id, nombre ), studios ( nombre )')
    .eq('estado', estado)
    .order('creado_en', { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: 'No se han podido cargar las reseñas.' }, { status: 500 });

  type FilaCruda = {
    id: string; puntuacion: number; comentario: string | null; estado: string; creado_en: string;
    red_perfiles: { id: string; nombre: string } | null;
    studios: { nombre: string | null } | null;
  };
  const resenas = ((data ?? []) as unknown as FilaCruda[]).map(f => ({
    id: f.id,
    puntuacion: f.puntuacion,
    comentario: f.comentario,
    estado: f.estado,
    creadoEn: f.creado_en,
    perfilId: f.red_perfiles?.id ?? null,
    perfilNombre: f.red_perfiles?.nombre ?? 'Perfil eliminado',
    estudioNombre: f.studios?.nombre ?? 'Estudio',
  }));

  return NextResponse.json({ resenas });
}

const ESTADOS_VALIDOS = new Set(['pendiente', 'publicada', 'oculta']);

export async function PATCH(req: NextRequest) {
  const g = await exigirPermiso(req, 'network.moderate');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { id?: unknown; estado?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : null;
  const estado = typeof body?.estado === 'string' ? body.estado : null;
  if (!id || !estado || !ESTADOS_VALIDOS.has(estado)) {
    return NextResponse.json({ error: 'Datos no válidos.' }, { status: 400 });
  }

  const { error } = await db
    .from('red_resenas')
    .update({ estado, moderado_en: new Date().toISOString(), moderado_por: g.admin.userId })
    .eq('id', id);
  if (error) return NextResponse.json({ error: 'No se ha podido actualizar la reseña.' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
