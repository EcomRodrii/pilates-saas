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
import {
  evaluarSuscripcion,
  evaluarFeature,
  evaluarLimiteSocias,
  type Denegacion,
} from '@/lib/billing/billing-rules';
import type { Entitlements } from '@/lib/billing/entitlements';

export { billingEnforced } from '@/lib/billing/billing-rules';

function aRespuesta(denegacion: Denegacion | null): NextResponse | null {
  if (!denegacion) return null;
  const { status, ...body } = denegacion;
  return NextResponse.json(body, { status });
}

export async function bloqueoPorSuscripcion(studioId: string): Promise<NextResponse | null> {
  return aRespuesta(await evaluarSuscripcion(studioId));
}

export async function bloqueoPorFeature(
  studioId: string,
  feature: keyof Entitlements['features'],
): Promise<NextResponse | null> {
  return aRespuesta(await evaluarFeature(studioId, feature));
}

export async function bloqueoPorLimiteSocias(
  studioId: string,
  sociasActuales: number,
  aAnadir: number,
): Promise<NextResponse | null> {
  return aRespuesta(await evaluarLimiteSocias(studioId, sociasActuales, aAnadir));
}
