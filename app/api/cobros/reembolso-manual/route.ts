import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { esMetodoReembolsoManual, reembolsarReciboAMano } from '@/lib/billing/reembolso-manual';

export const dynamic = 'force-dynamic';

// «Le he devuelto el dinero» desde Cobros: el estudio le devolvió a mano el
// dinero de un cobro hecho a mano. Ya no debe nada (lib/billing/reembolso-manual.ts).
// Sin `bloqueoPorSuscripcion`, igual que «El banco lo devolvió»: anotar que un
// dinero ya no está no cobra nada.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  // La UI esconde el botón, pero la UI nunca es el límite.
  if (!puedeMoverDinero(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede registrar devoluciones' }, { status: 403 });
  }
  const limitado = await enforceRateLimit(req, 'cobros-reembolso-manual', { max: 30, windowSeconds: 60 }, sesion.userId);
  if (limitado) return limitado;

  const body = await req.json().catch(() => null) as { reciboId?: unknown; metodo?: unknown } | null;
  if (typeof body?.reciboId !== 'string' || !body.reciboId) {
    return NextResponse.json({ error: 'Falta el recibo' }, { status: 400 });
  }
  // Por dónde salió el dinero: decide si se apunta en la caja, y puede no ser el del cobro.
  if (!esMetodoReembolsoManual(body.metodo)) {
    return NextResponse.json({ error: 'Di cómo le has devuelto el dinero' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Service role no configurada' }, { status: 503 });

  const r = await reembolsarReciboAMano(admin, {
    studioId: sesion.studioId, reciboId: body.reciboId, metodo: body.metodo, ahoraISO: new Date().toISOString(),
    // Quien lo hizo, para el libro y la caja: la sesión, nunca el cuerpo.
    actor: { userId: sesion.userId, rol: sesion.rol, nombre: sesion.nombre },
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.http });
  return NextResponse.json({ ok: true, yaEstaba: r.yaEstaba, importe: r.importe, caja: r.caja });
}
