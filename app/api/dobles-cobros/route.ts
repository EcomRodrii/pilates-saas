import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeMoverDinero } from '@/lib/permisos-reglas';

// PAY-5: cara del detector de dobles cobros para la propietaria. La tabla
// `dobles_cobros_detectados` es solo de servidor (sin grants a `authenticated`),
// así que esta ruta con service-role acota por estudio Y por rol: mismo guardia
// que reembolsos y cierre de caja (`puedeMoverDinero`). Nunca devuelve ids de
// PaymentIntent: quien devuelve el cargo lo busca desde el recibo.

async function contexto(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return { error: NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 }) };
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  if (!puedeMoverDinero(sesion.rol)) {
    return { error: NextResponse.json({ error: 'Tu rol no puede revisar cobros duplicados.' }, { status: 403 }) };
  }
  return { admin, sesion };
}

export async function GET(req: NextRequest) {
  const c = await contexto(req);
  if ('error' in c) return c.error;
  const { data, error } = await c.admin
    .from('dobles_cobros_detectados')
    .select('id, recibo_id, payment_intent_ids, detectado_en, recibos(concepto, importe)')
    .eq('studio_id', c.sesion.studioId)
    .eq('estado', 'DETECTADA')
    .order('detectado_en', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: 'No se pudo leer' }, { status: 500 });
  return NextResponse.json({
    pendientes: (data ?? []).map((f) => {
      const r = (Array.isArray(f.recibos) ? f.recibos[0] : f.recibos) as { concepto: string | null; importe: number | null } | null;
      return {
        id: f.id as string,
        concepto: r?.concepto ?? null,
        importe: r?.importe == null ? null : Number(r.importe),
        cargos: ((f.payment_intent_ids as string[] | null) ?? []).length,
        detectadoEn: f.detectado_en as string,
      };
    }),
  });
}

// La propietaria confirma que ya lo ha revisado (y devuelto lo que sobraba).
// Compare-and-set sobre DETECTADA y sobre su estudio: no resuelve el de otro.
export async function POST(req: NextRequest) {
  const c = await contexto(req);
  if ('error' in c) return c.error;
  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : null;
  if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 });
  const { data, error } = await c.admin
    .from('dobles_cobros_detectados')
    .update({ estado: 'RESUELTO', resuelto_en: new Date().toISOString() })
    .eq('id', id).eq('studio_id', c.sesion.studioId).eq('estado', 'DETECTADA')
    .select('id');
  if (error) return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'Ya estaba resuelto o no existe' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
