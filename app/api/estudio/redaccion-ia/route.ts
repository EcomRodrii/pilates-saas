import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import { FLAG_REDACCION_IA, redaccionIaActiva } from '@/lib/decision/redaccion-ia';
import { uid } from '@/lib/utils';

// Interruptor «Redactar con IA» del estudio (lib/decision/redaccion-ia.ts).
//
// Solo PROPIETARIO: decide qué hace el encargado con los datos de sus alumnas
// (contrato de encargo), igual que la exportación de todo el estudio. Sin gate
// de plan: es una preferencia de privacidad, no una función de pago.
//
// La escritura se CONFIRMA: `dbSetFeatureFlag` se traga el error, y aquí un
// «apagado» que no se guardó seguiría mandando datos a la IA mientras la
// pantalla dice que no.

async function propietaria(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  if (sesion.rol !== 'PROPIETARIO') {
    return { error: NextResponse.json({ error: 'Solo la propietaria puede cambiar esto' }, { status: 403 }) };
  }
  const admin = getSupabaseAdmin();
  if (!admin) return { error: NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 }) };
  return { sesion, admin };
}

export async function GET(req: NextRequest) {
  const g = await propietaria(req);
  if ('error' in g) return g.error;
  const { data, error } = await g.admin.from('decision_feature_flags').select('flag, activo')
    .eq('studio_id', g.sesion.studioId).eq('flag', FLAG_REDACCION_IA);
  if (error) return errorInterno('estudio/redaccion-ia:GET', error, 'No se ha podido leer el ajuste.');
  return NextResponse.json({ activo: redaccionIaActiva((data ?? []) as { flag: string; activo: boolean }[]) });
}

export async function PUT(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'estudio-redaccion-ia', { max: 20, windowSeconds: 60 });
  if (limited) return limited;
  const g = await propietaria(req);
  if ('error' in g) return g.error;
  const body = await req.json().catch(() => null) as { activo?: unknown } | null;
  if (typeof body?.activo !== 'boolean') return NextResponse.json({ error: 'Falta «activo» (sí o no)' }, { status: 400 });

  const { data, error } = await g.admin.from('decision_feature_flags').upsert({
    id: uid(), studio_id: g.sesion.studioId, flag: FLAG_REDACCION_IA, activo: body.activo,
    activado_en: new Date().toISOString(), activado_por: g.sesion.userId,
  }, { onConflict: 'studio_id,flag' }).select('activo').single();
  if (error || !data) return errorInterno('estudio/redaccion-ia:PUT', error, 'No se ha podido guardar. Inténtalo de nuevo.');
  return NextResponse.json({ activo: data.activo as boolean });
}
