import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarInstructoraEnEstudio } from '@/lib/auth-instructora';
import { estadoFichaje, registrarEntrada, registrarSalida } from '@/lib/fichaje/fichaje-servidor';
import { enforceRateLimit, rateLimit } from '@/lib/rate-limit';
import { retryAfterSeconds, tooManyRequestsResponse } from '@/lib/rate-limit-core';
import { errorInterno } from '@/lib/errores-servidor';

// Fichaje de la instructora desde la app del estudio: ver su estado, entrar y salir.
//
// La instructora y el estudio salen del token + slug (`verificarInstructoraEnEstudio`),
// nunca del body: del body solo viene la acción. Salir no recibe id de jornada:
// cierra la abierta de quien llama.
//
// Entrar y salir son idempotentes (doble clic, dos pestañas, un reintento tras
// perder cobertura): devuelven `yaAbierta` / `yaCerrada` con el estado real.
const LIMITE = { max: 30, windowSeconds: 60 };
const ACCIONES = ['estado', 'entrada', 'salida'] as const;
type Accion = typeof ACCIONES[number];

export async function POST(req: NextRequest) {
  const porIp = await enforceRateLimit(req, 'portal-instructora-fichaje-ip', { max: 60, windowSeconds: 60 });
  if (porIp) return porIp;

  const body = await req.json().catch(() => null) as { slug?: string; accion?: unknown } | null;
  if (!body?.slug) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });
  const accion = ACCIONES.find((a) => a === body.accion) as Accion | undefined;
  if (!accion) return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });

  try {
    const sesion = await verificarInstructoraEnEstudio(req, body.slug);
    if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const limite = await rateLimit(`portal-instructora-fichaje:${sesion.instructorId}`, LIMITE);
    if (!limite.allowed) return tooManyRequestsResponse(retryAfterSeconds(limite.resetAt, LIMITE.windowSeconds));

    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

    const ctx = { studioId: sesion.studioId, instructorId: sesion.instructorId, userId: sesion.userId };
    let extra: Record<string, unknown> = {};

    if (accion === 'entrada' || accion === 'salida') {
      const r = accion === 'entrada' ? await registrarEntrada(admin, ctx) : await registrarSalida(admin, ctx);
      if (!r.ok) {
        return errorInterno(`portal/instructora/fichaje:${accion}`, new Error(r.error),
          'No hemos podido registrarlo. Inténtalo de nuevo.');
      }
      if (!r.auditoriaOk) {
        Sentry.captureMessage('[fichaje] jornada registrada sin su fila de auditoría', {
          level: 'error', tags: { area: 'fichaje' }, extra: { accion, studioId: ctx.studioId, instructorId: ctx.instructorId },
        });
      }
      extra = 'yaAbierta' in r ? { yaAbierta: r.yaAbierta } : { yaCerrada: r.yaCerrada, minutos: r.minutos };
    }

    return NextResponse.json({ ...extra, estado: await estadoFichaje(admin, ctx) });
  } catch (err) {
    return errorInterno(`portal/instructora/fichaje:${accion}`, err,
      'No hemos podido cargar tu fichaje. Inténtalo de nuevo.');
  }
}
