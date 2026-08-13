import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';

export const runtime = 'nodejs';

// Cola de verificación de certificaciones/formación (paso 06 del wizard) —
// mismo patrón que verificaciones-identidad/route.ts en este mismo commit.
// "Formación verificada" en el perfil público (README) sale directamente
// de `red_certificaciones.estado`, así que no hace falta tocar
// red_perfiles al aprobar (a diferencia de identidad, que sí actualiza
// identidad_verificada_en) — el propio estado de la fila ES la señal.
export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'network.moderate');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const estado = req.nextUrl.searchParams.get('estado') ?? 'pendiente';

  const { data, error } = await db
    .from('red_certificaciones')
    .select('id, nombre, institucion, anio, duracion, estado, motivo_rechazo, documento_path, creado_en, resuelto_en, red_perfiles ( id, nombre, slug )')
    .eq('estado', estado)
    .order('creado_en', { ascending: true })
    .limit(500);
  if (error) return NextResponse.json({ error: 'No se han podido cargar las certificaciones.' }, { status: 500 });

  type FilaCruda = {
    id: string; nombre: string; institucion: string; anio: number | null; duracion: string | null;
    estado: string; motivo_rechazo: string | null; documento_path: string;
    creado_en: string; resuelto_en: string | null;
    red_perfiles: { id: string; nombre: string; slug: string | null } | null;
  };
  const certificaciones = ((data ?? []) as unknown as FilaCruda[]).map(f => ({
    id: f.id,
    nombre: f.nombre,
    institucion: f.institucion,
    anio: f.anio,
    duracion: f.duracion,
    estado: f.estado,
    motivoRechazo: f.motivo_rechazo,
    creadoEn: f.creado_en,
    resueltoEn: f.resuelto_en,
    perfilId: f.red_perfiles?.id ?? null,
    perfilNombre: f.red_perfiles?.nombre ?? 'Perfil eliminado',
    perfilSlug: f.red_perfiles?.slug ?? null,
  }));

  return NextResponse.json({ certificaciones });
}

export async function PATCH(req: NextRequest) {
  const g = await exigirPermiso(req, 'network.moderate');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { id?: unknown; aprobar?: unknown; motivo?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : null;
  const aprobar = typeof body?.aprobar === 'boolean' ? body.aprobar : null;
  const motivo = typeof body?.motivo === 'string' ? body.motivo.trim() : '';
  if (!id || aprobar === null) return NextResponse.json({ error: 'Datos no válidos.' }, { status: 400 });
  if (!aprobar && !motivo) return NextResponse.json({ error: 'Indica el motivo del rechazo.' }, { status: 400 });

  const { data: fila, error: errLeer } = await db.from('red_certificaciones').select('id, estado').eq('id', id).maybeSingle();
  if (errLeer) return NextResponse.json({ error: 'No se ha podido leer la certificación.' }, { status: 500 });
  if (!fila) return NextResponse.json({ error: 'Certificación no encontrada.' }, { status: 404 });
  if (fila.estado !== 'pendiente' && fila.estado !== 'en_revision') {
    return NextResponse.json({ error: 'Esta certificación ya está resuelta.' }, { status: 409 });
  }

  // .in('estado', [...]) en el propio UPDATE, no solo en el SELECT de
  // arriba — cierra la carrera de dos admins (o un doble clic) resolviendo
  // la misma fila a la vez, mismo criterio que verificaciones-identidad.
  const { error, count } = await db
    .from('red_certificaciones')
    .update({
      estado: aprobar ? 'verificado' : 'rechazado',
      motivo_rechazo: aprobar ? null : motivo,
      resuelto_en: new Date().toISOString(),
      resuelto_por: g.admin.userId,
    }, { count: 'exact' })
    .eq('id', id)
    .in('estado', ['pendiente', 'en_revision']);
  if (error) return NextResponse.json({ error: 'No se ha podido actualizar la certificación.' }, { status: 500 });
  if (!count) return NextResponse.json({ error: 'Esta certificación ya está resuelta.' }, { status: 409 });

  return NextResponse.json({ ok: true });
}
