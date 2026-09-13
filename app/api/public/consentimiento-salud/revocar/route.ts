import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { respuestaCambioConsentimiento } from '@/lib/datos-salud/consentimiento';

// La alumna retira su consentimiento de datos de salud desde su app (art. 7.3
// RGPD: tan fácil retirarlo como darlo).
//
//  · El `socioId` sale del JWT cruzado con el estudio, NUNCA del cuerpo.
//  · Sella la revocación sin borrar la prueba anterior y apunta el evento
//    (`consentimiento_salud_cambiar`, service_role).
//  · Los datos quedan BLOQUEADOS: la RLS de las tablas de salud exige
//    consentimiento vigente, así que el personal deja de verlos. No se borran;
//    borrarlos es una solicitud de supresión aparte. ⚠️ Decisión legal pendiente.

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-consentimiento-salud-revocar', { max: 10, windowSeconds: 60 });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { studioId?: unknown } | null;
  const studioId = typeof body?.studioId === 'string' ? body.studioId : '';
  if (!studioId) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 500 });
  try {
    const { data: resultado, error } = await admin.rpc('consentimiento_salud_cambiar', {
      p_studio_id: studioId,
      p_socio_id: socioId,
      p_tipo: 'REVOCADO',
      p_origen: 'PORTAL',
      p_texto: null,
      p_firma: 'SOCIA',
      p_actor_uid: user.userId,
      p_actor_rol: 'SOCIA',
    });
    if (error) return errorInterno('public/consentimiento-salud/revocar:POST', error, 'No hemos podido retirar tu consentimiento.');
    const r = respuestaCambioConsentimiento(resultado);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, cambiado: r.cambiado, estado: 'REVOCADO' });
  } catch (e) {
    return errorInterno('public/consentimiento-salud/revocar:POST', e, 'No hemos podido retirar tu consentimiento.');
  }
}
