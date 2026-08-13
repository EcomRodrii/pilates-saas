import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { uid } from '@/lib/utils';

// Reportar un perfil — docs/NETWORK-IMPLEMENTATION-PLAN.md §10/§7.
// Abierto a cualquier persona autenticada (verificarUsuarioSupabase, no
// verificarSesionStaff): la RLS de INSERT en `red_reportes` ya lo exige así
// (Fase 1) y un reporte de mala fe no necesita pertenecer a ningún estudio
// concreto.
const MOTIVOS_VALIDOS = new Set(['informacion_falsa', 'suplantacion', 'spam', 'comportamiento', 'fraude', 'otro']);

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { perfilId?: unknown; motivo?: unknown; detalle?: unknown } | null;
  const perfilId = typeof body?.perfilId === 'string' ? body.perfilId : null;
  const motivo = typeof body?.motivo === 'string' ? body.motivo : null;
  if (!perfilId || !motivo || !MOTIVOS_VALIDOS.has(motivo)) return errorPeticion('Datos no válidos.');
  const detalle = body?.detalle == null || body.detalle === '' ? null : String(body.detalle).trim();

  const { data: perfil } = await admin.from('red_perfiles').select('id').eq('id', perfilId).maybeSingle();
  if (!perfil) return errorPeticion('Este perfil no existe.', 404);

  const { error } = await admin
    .from('red_reportes')
    .insert({ id: `redreporte-${uid()}`, perfil_id: perfilId, reportado_por: usuario.userId, motivo, detalle });
  if (error) return errorInterno('network:reportes:POST', error, 'No se ha podido enviar el reporte.');

  return NextResponse.json({ ok: true });
}
