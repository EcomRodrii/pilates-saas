import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarInstructoraEnEstudio } from '@/lib/auth-instructora';
import {
  cambiarFinClase, confirmarClases, empezarClase, estadoClasesInstructora, MAX_CONFIRMAR, type ItemConfirmar,
} from '@/lib/fichaje/clases-impartidas';
import { enforceRateLimit, rateLimit } from '@/lib/rate-limit';
import { retryAfterSeconds, tooManyRequestsResponse } from '@/lib/rate-limit-core';
import { errorInterno } from '@/lib/errores-servidor';

// Clases impartidas desde la app del estudio: su clase de ahora y las olvidadas
// (estado), empezar una clase, «terminé antes» y confirmar las olvidadas.
//
// La instructora y el estudio salen del token + slug; del body solo la clase y la
// acción. Una clase ajena responde igual que una que no existe.
const LIMITE = { max: 40, windowSeconds: 60 };
const ACCIONES = ['estado', 'empezar', 'terminar', 'confirmar'] as const;

export async function POST(req: NextRequest) {
  const porIp = await enforceRateLimit(req, 'portal-instructora-clases-ip', { max: 80, windowSeconds: 60 });
  if (porIp) return porIp;

  const body = await req.json().catch(() => null) as
    { slug?: string; accion?: unknown; sesionId?: unknown; fin?: unknown; items?: unknown } | null;
  if (!body?.slug) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });
  const accion = ACCIONES.find((a) => a === body.accion);
  if (!accion) return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  const sesionId = typeof body.sesionId === 'string' ? body.sesionId : null;
  if ((accion === 'empezar' || accion === 'terminar') && !sesionId) {
    return NextResponse.json({ error: 'Falta la clase' }, { status: 400 });
  }

  try {
    const sesion = await verificarInstructoraEnEstudio(req, body.slug);
    if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const limite = await rateLimit(`portal-instructora-clases:${sesion.instructorId}`, LIMITE);
    if (!limite.allowed) return tooManyRequestsResponse(retryAfterSeconds(limite.resetAt, LIMITE.windowSeconds));
    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
    const ctx = { studioId: sesion.studioId, instructorId: sesion.instructorId, userId: sesion.userId };

    if (accion === 'empezar') {
      const r = await empezarClase(admin, ctx, sesionId!);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
      return NextResponse.json({ ok: true, yaEmpezada: r.yaEmpezada, jornadaAbierta: r.jornadaAbierta, estado: await estadoClasesInstructora(admin, ctx) });
    }
    if (accion === 'terminar') {
      const fin = typeof body.fin === 'string' ? new Date(body.fin) : new Date(NaN);
      const r = await cambiarFinClase(admin, ctx, sesionId!, fin);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
      return NextResponse.json({ ok: true, estado: await estadoClasesInstructora(admin, ctx) });
    }
    if (accion === 'confirmar') {
      if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > MAX_CONFIRMAR) {
        return NextResponse.json({ error: 'Petición no válida' }, { status: 400 });
      }
      const items: ItemConfirmar[] = [];
      for (const raw of body.items as unknown[]) {
        const it = raw as { sesionId?: unknown; modo?: unknown; inicio?: unknown; fin?: unknown };
        if (typeof it?.sesionId !== 'string' || (it.modo !== 'A_SU_HORA' && it.modo !== 'OTRO_HORARIO' && it.modo !== 'NO_DADA')) {
          return NextResponse.json({ error: 'Petición no válida' }, { status: 400 });
        }
        items.push({
          sesionId: it.sesionId, modo: it.modo,
          inicio: typeof it.inicio === 'string' ? new Date(it.inicio) : undefined,
          fin: typeof it.fin === 'string' ? new Date(it.fin) : undefined,
        });
      }
      const r = await confirmarClases(admin, ctx, items);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
      return NextResponse.json({ ok: true, confirmadas: r.confirmadas, errores: r.errores, estado: await estadoClasesInstructora(admin, ctx) });
    }
    return NextResponse.json({ estado: await estadoClasesInstructora(admin, ctx) });
  } catch (err) {
    return errorInterno(`portal/instructora/clases:${accion}`, err, 'No hemos podido guardarlo. Inténtalo de nuevo.');
  }
}
