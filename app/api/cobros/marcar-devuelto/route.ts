import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { marcarReciboDevuelto } from '@/lib/billing/marcar-devuelto';

export const dynamic = 'force-dynamic';

// «Marcar devuelto» desde Cobros. Pasa por servidor para que, si el recibo era
// el de una penalización cobrada, la penalización deje de imputarse a la
// instructora (ver lib/billing/marcar-devuelto.ts). Sin `bloqueoPorSuscripcion`
// a propósito: anotar que un dinero no está no cobra nada, y el UPDATE directo
// al que sustituye tampoco lo tenía.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  // La UI esconde el botón, pero la UI nunca es el límite.
  if (!puedeMoverDinero(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede marcar recibos como devueltos' }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as { reciboId?: unknown } | null;
  if (typeof body?.reciboId !== 'string' || !body.reciboId) {
    return NextResponse.json({ error: 'Falta el recibo' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Service role no configurada' }, { status: 503 });

  const r = await marcarReciboDevuelto(admin, {
    studioId: sesion.studioId, reciboId: body.reciboId, ahoraISO: new Date().toISOString(),
    // Quien lo hizo, para el libro de auditoría: la sesión, nunca el cuerpo.
    actor: { userId: sesion.userId, rol: sesion.rol },
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.http });
  return NextResponse.json({ ok: true, fechaDevolucion: r.fechaDevolucion, yaEstaba: r.yaEstaba });
}
