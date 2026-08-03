import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';

// GET /api/socios/[id]/comunicaciones — historial REAL de envíos a una socia
// (email por ahora). Antes la pestaña "Comunicaciones" de la ficha era un
// useState local sin persistencia: el email SÍ se enviaba, pero el registro
// de "enviado" solo vivía en memoria del navegador y desaparecía en
// cualquier remount — parecía que el mensaje se esfumaba aunque hubiera
// llegado de verdad. Los envíos se registran en `comunicaciones_socio` desde
// app/api/emails/send/route.ts.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: socioId } = await params;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await admin
    .from('comunicaciones_socio')
    .select('id, tipo, asunto, estado, error, creado_en, creado_por_nombre')
    .eq('studio_id', sesion.studioId)
    .eq('socio_id', socioId)
    .order('creado_en', { ascending: false })
    .limit(200);
  if (error) return errorInterno('socios:comunicaciones', error, 'No se ha podido cargar el historial de comunicaciones.');

  const items = (data ?? []).map(r => ({
    id: r.id as string,
    tipo: r.tipo as string,
    asunto: r.asunto as string,
    estado: r.estado as 'ENVIADO' | 'FALLIDO',
    error: r.error as string | null,
    creadoEn: r.creado_en as string,
    creadoPorNombre: r.creado_por_nombre as string | null,
  }));
  return NextResponse.json({ items });
}
