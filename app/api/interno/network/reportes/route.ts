import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';

export const runtime = 'nodejs';

// Reportes de Tentare Network — docs/NETWORK-IMPLEMENTATION-PLAN.md §10.
// `red_reportes` no tiene política SELECT para `authenticated` a propósito
// (Fase 1): solo se lee aquí, con service-role, tras exigirPermiso.
export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'network.moderate');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const estado = req.nextUrl.searchParams.get('estado') ?? 'pendiente';

  const { data, error } = await db
    .from('red_reportes')
    .select('id, motivo, detalle, estado, creado_en, revisado_en, red_perfiles ( id, nombre )')
    .eq('estado', estado)
    .order('creado_en', { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: 'No se han podido cargar los reportes.' }, { status: 500 });

  type FilaCruda = {
    id: string; motivo: string; detalle: string | null; estado: string; creado_en: string; revisado_en: string | null;
    red_perfiles: { id: string; nombre: string } | null;
  };
  const reportes = ((data ?? []) as unknown as FilaCruda[]).map(f => ({
    id: f.id,
    motivo: f.motivo,
    detalle: f.detalle,
    estado: f.estado,
    creadoEn: f.creado_en,
    revisadoEn: f.revisado_en,
    perfilId: f.red_perfiles?.id ?? null,
    perfilNombre: f.red_perfiles?.nombre ?? 'Perfil eliminado',
  }));

  return NextResponse.json({ reportes });
}

const ESTADOS_VALIDOS = new Set(['pendiente', 'revisado', 'resuelto']);

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
    .from('red_reportes')
    .update({ estado, revisado_en: new Date().toISOString(), revisado_por: g.admin.userId })
    .eq('id', id);
  if (error) return NextResponse.json({ error: 'No se ha podido actualizar el reporte.' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
