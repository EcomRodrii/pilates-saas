// ─────────────────────────────────────────────────────────────────────────────
// R7 · Envoltorio HTTP de las reglas de billing (lib/billing/billing-rules.ts).
// Esto es lo que importan las rutas API: cada guarda devuelve `null` si se puede
// continuar, o un `NextResponse` de error que el llamador devuelve tal cual:
//
//     const bloqueo = await bloqueoPorSuscripcion(sesion.studioId);
//     if (bloqueo) return bloqueo;
//
// La lógica (fail-open detrás de BILLING_ENFORCED) vive en billing-rules.ts, que
// es pura y testeable sin next/server.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import {
  evaluarSuscripcion,
  evaluarSuspension,
  evaluarFeature,
  type Denegacion,
} from '@/lib/billing/billing-rules';
import type { Entitlements } from '@/lib/billing/entitlements';
import { ESTADO_GRATIS } from '@/lib/billing/plan-gratis';
import { topeEstricto } from '@/lib/rate-limit';
import { hoyEnEstudio } from '@/lib/utils';

export { billingEnforced } from '@/lib/billing/billing-rules';

function aRespuesta(denegacion: Denegacion | null): NextResponse | null {
  if (!denegacion) return null;
  const { status, ...body } = denegacion;
  return NextResponse.json(body, { status });
}

export async function bloqueoPorSuscripcion(studioId: string): Promise<NextResponse | null> {
  return aRespuesta(await evaluarSuscripcion(getSupabaseAdmin(), studioId));
}

/**
 * M-3 (auditoría 58ª pasada). `evaluarSuscripcion` ya encadena la suspensión
 * PRIMERO (billing-rules.ts) para las rutas que cobran, pero las que NO cobran
 * -crear una reserva, que puede ser gratis o cubierta por un plan- nunca
 * llamaban a ninguna de las dos: un estudio suspendido a mano (impago
 * persistente, abuso, petición del cliente) seguía dejando reservar. A
 * diferencia de `bloqueoPorSuscripcion`, esto NO exige `BILLING_ENFORCED` (la
 * suspensión manda siempre) y no arrastra ninguna otra regla de billing.
 */
export async function bloqueoPorSuspension(studioId: string): Promise<NextResponse | null> {
  return aRespuesta(await evaluarSuspension(getSupabaseAdmin(), studioId));
}

export async function bloqueoPorFeature(
  studioId: string,
  feature: keyof Entitlements['features'],
): Promise<NextResponse | null> {
  const admin = getSupabaseAdmin();
  const denegada = aRespuesta(await evaluarFeature(admin, studioId, feature));
  if (denegada || feature !== 'ia' || !admin) return denegada;
  return await topeIaGratis(admin, studioId);
}

/**
 * Founding Studio gratis (lib/billing/plan-gratis.ts) tiene la IA de notas,
 * campañas y fichas como todos, pero con un tope por día: cada una cuesta
 * dinero por llamada y sin esto solo la frenaba el límite por minuto. Cerrado
 * si el contador falla (`topeEstricto`). En Estudio y Cadena, sin tope.
 */
export const TOPE_IA_GRATIS_DIA = 40;

async function topeIaGratis(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, studioId: string): Promise<NextResponse | null> {
  const { data } = await admin.from('studios').select('subscription_status').eq('id', studioId).maybeSingle();
  if (data?.subscription_status !== ESTADO_GRATIS) return null;
  const r = await topeEstricto(`ia-gratis:${studioId}:${hoyEnEstudio()}`, { max: TOPE_IA_GRATIS_DIA, windowSeconds: 36 * 3600 });
  if (r.allowed) return null;
  return NextResponse.json(
    { error: `Has usado las ${TOPE_IA_GRATIS_DIA} ayudas con IA de hoy del plan gratis. Mañana vuelves a tenerlas; con Estudio, sin límite.`, code: 'TOPE_IA_GRATIS' },
    { status: 429 },
  );
}
