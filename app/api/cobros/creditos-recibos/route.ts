import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { seguirCreditosAlRecibo, type ResultadoCreditosRecibo } from '@/lib/billing/creditos-recibo-server';
import { evaluarFeature } from '@/lib/billing/billing-rules';

export const dynamic = 'force-dynamic';

/** Un «cobrar pendientes» del panel cobra como mucho esto de una vez por aquí. */
const MAX_RECIBOS = 50;

// Créditos de «Renovar plan» tras un cobro hecho a mano en el panel («marcar
// cobrado», «cobrar pendientes»). Ese cobro todavía se escribe desde el
// navegador (#1987 lo pasa a servidor), así que aquí solo llega el aviso de
// «estos recibos acaban de cobrarse»: quién gana créditos, y si los gana, lo
// decide la base con el estado REAL de cada recibo
// (`sincronizar_creditos_renovacion`). El navegador no decide nada, y pedirlo
// para un recibo que no toca, o dos veces, no da ni quita un crédito.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  // El mismo permiso que cobrar a mano. La UI nunca es el límite.
  if (!puedeMoverDinero(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede cobrar recibos' }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as { reciboIds?: unknown } | null;
  const ids = Array.isArray(body?.reciboIds) ? body.reciboIds : null;
  if (!ids || ids.length === 0 || ids.length > MAX_RECIBOS
      || !ids.every((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 100)) {
    return NextResponse.json({ error: 'Recibos no válidos' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Service role no configurada' }, { status: 503 });

  // El plan es del estudio, no de cada recibo: se mira una vez.
  const puedeOtorgar = await evaluarFeature(admin, sesion.studioId, 'gamificacion').then(d => !d, () => false);

  // En serie: dos recibos de la misma socia tocan su mismo saldo.
  const resultados: Array<{ reciboId: string } & ResultadoCreditosRecibo> = [];
  for (const reciboId of new Set(ids)) {
    // El estudio sale de la sesión, nunca del cuerpo: la base acota por él.
    const r = await seguirCreditosAlRecibo(admin, { studioId: sesion.studioId, reciboId, puedeOtorgar });
    if (r) resultados.push({ reciboId, ...r });
  }
  return NextResponse.json({ ok: true, resultados });
}
