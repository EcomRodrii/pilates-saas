import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { enforceRateLimit } from '@/lib/rate-limit';
import { guardaAntesDeCobrar } from '@/lib/cobros/antes-de-cobrar-a-mano-servidor';
import { parsearEstados } from '@/lib/cobros-externos/peticiones';
import { listarMovimientos, recuperarColgados, reemparejarPendientes } from '@/lib/cobros-externos/servidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ─────────────────────────────────────────────────────────────────────────────
// La bandeja de cobros externos: los movimientos que esperan a una persona.
//
// Al abrirla, antes de listar:
//  1. se recuperan las confirmaciones que murieron a medias (un `CONFIRMANDO` de
//     hace más de 2 minutos): o se cobró y se terminan sus efectos, o se suelta;
//  2. el motor vuelve a pasar por lo que sigue en revisión: una transferencia que
//     llegó antes que su recibo (la renovación la crea un cron) lo encuentra ahora.
// Las dos cosas son de mejor esfuerzo: si fallan, se lista igual.
//
// Solo quien mueve dinero; el estudio sale SIEMPRE de la sesión.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeMoverDinero(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede ver los cobros' }, { status: 403 });
  }
  const limitado = await enforceRateLimit(req, 'cobros-externos-listar', { max: 30, windowSeconds: 60 }, sesion.userId);
  if (limitado) return limitado;

  const estados = parsearEstados(new URL(req.url).searchParams.get('estado'));
  if (!estados) return NextResponse.json({ error: 'Estado no válido.' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const bandeja = { userId: sesion.userId, studioId: sesion.studioId, rol: sesion.rol, nombre: sesion.nombre };
  try {
    await recuperarColgados(admin, bandeja, { antesDeCobrar: guardaAntesDeCobrar(admin, sesion.studioId) });
    await reemparejarPendientes(admin, sesion.studioId);
  } catch (e) {
    Sentry.captureException(e instanceof Error ? e : new Error('Fallo preparando la bandeja de cobros externos'), {
      level: 'warning', tags: { area: 'cobros', tipo: 'cobros-externos' }, extra: { studioId: sesion.studioId },
    });
  }

  const r = await listarMovimientos(admin, sesion.studioId, estados);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 });
  return NextResponse.json(r.listado);
}
