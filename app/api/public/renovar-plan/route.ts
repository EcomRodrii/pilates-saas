import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/supabase-data';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

// "Renovar en un toque" desde el portal: garantiza que exista el recibo de
// renovación del plan de la socia y devuelve su id — el portal lo paga acto
// seguido con el checkout de recibos que ya usa para los pendientes. Exige
// sesión real de socia (JWT verificado); su suscripción se resuelve en
// servidor, nunca del body.
//
// Id determinista por (suscripción, mes) — la MISMA convención que el cron de
// renovaciones (lib/inngest/renovaciones.ts): si el cron ya lo generó esta
// mañana, el insert choca por PK y se reutiliza; si lo genera él después, es
// este el que encuentra por dedupe.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-renovar-plan', { max: 10, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { studioId?: string } | null;
  if (!body?.studioId) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const socioId = await socioAutenticado(user.userId, body.studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    // Suscripción de la socia: la ACTIVA, o la más reciente si ninguna lo está.
    const { data: susRows, error: susErr } = await admin
      .from('suscripciones')
      .select('id, plan_id, estado, fecha_inicio, fecha_fin, sesiones_restantes')
      .eq('studio_id', body.studioId)
      .eq('socio_id', socioId)
      .order('fecha_inicio', { ascending: false });
    if (susErr) throw new Error(susErr.message);
    const sus = (susRows ?? []).find(s => s.estado === 'ACTIVA') ?? (susRows ?? [])[0];
    if (!sus) return NextResponse.json({ error: 'No tienes ningún plan que renovar' }, { status: 404 });

    const { data: plan, error: planErr } = await admin
      .from('planes_tarifa')
      .select('id, nombre, precio, tipo')
      .eq('id', sus.plan_id)
      .eq('studio_id', body.studioId)
      .maybeSingle();
    if (planErr) throw new Error(planErr.message);
    if (!plan) return NextResponse.json({ error: 'Tu plan ya no existe. Habla con tu estudio.' }, { status: 404 });

    // Si ya hay un recibo de renovación en juego, se reutiliza (el portal lo
    // paga): puede venir del cron, del panel o de un toque anterior.
    const { data: pendiente, error: penErr } = await admin
      .from('recibos')
      .select('id')
      .eq('studio_id', body.studioId)
      .eq('suscripcion_id', sus.id)
      .in('estado', ['PENDIENTE', 'EN_CURSO'])
      .limit(1)
      .maybeSingle();
    if (penErr) throw new Error(penErr.message);
    if (pendiente) return NextResponse.json({ reciboId: pendiente.id });

    const hoy = new Date().toISOString().slice(0, 10);
    const id = `rec-renov-${sus.id}-${hoy.slice(0, 7)}`;
    const { error: insErr } = await admin.from('recibos').insert({
      id, studio_id: body.studioId, socio_id: socioId, suscripcion_id: sus.id,
      concepto: `Renovación ${plan.nombre}`, importe: plan.precio, estado: 'PENDIENTE',
      fecha_vencimiento: sus.fecha_fin ?? hoy, fecha_cobro: null, fecha_devolucion: null,
      intentos_reintento: 0,
    });
    // 23505: otro camino (cron, doble toque) lo creó en paralelo — se reutiliza.
    if (insErr && insErr.code !== '23505') throw new Error(insErr.message);

    return NextResponse.json({ reciboId: id });
  } catch (err) {
    return errorInterno('public/renovar-plan:POST', err, 'No se ha podido preparar la renovación.');
  }
}
