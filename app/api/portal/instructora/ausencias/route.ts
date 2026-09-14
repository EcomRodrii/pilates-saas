import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarInstructoraEnEstudio } from '@/lib/auth-instructora';
import { borrarAusencia, crearAusencia, listarAusencias } from '@/lib/sustituciones/ausencias-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

// Sus ausencias (vacaciones / baja médica / otro) desde la app del estudio: leer,
// crear y quitar. La lógica es la del panel (`lib/sustituciones/ausencias-servidor.ts`):
// bloqueos materializados para el motor, marcha atrás si fallan, clases afectadas
// y aviso a la propietaria.
//
// La instructora y el estudio salen del token + slug. Del body nunca se acepta un
// `instructorId`: siempre es ella, y solo puede quitar las suyas.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'portal-instructora-ausencias', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as
    { slug?: string; accion?: unknown; tipo?: unknown; desde?: unknown; hasta?: unknown; motivo?: unknown; id?: unknown } | null;
  if (!body?.slug) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });
  const accion = body.accion;
  if (accion !== 'leer' && accion !== 'crear' && accion !== 'borrar') {
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  }
  const id = typeof body.id === 'string' ? body.id : null;
  if (accion === 'borrar' && !id) return NextResponse.json({ error: 'Falta la ausencia' }, { status: 400 });
  if (accion === 'crear') {
    // Crear es lo caro (hasta 366 bloqueos y un aviso a la propietaria): límite
    // propio y más bajo, el mismo que pedir una baja.
    const limitadoCrear = await enforceRateLimit(req, 'portal-instructora-ausencias-crear', { max: 10, windowSeconds: 60 });
    if (limitadoCrear) return limitadoCrear;
  }

  try {
    const sesion = await verificarInstructoraEnEstudio(req, body.slug);
    if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
    const suyo = { studioId: sesion.studioId, instructorId: sesion.instructorId };
    const alcance = { instructorId: sesion.instructorId };

    if (accion === 'leer') {
      const items = await listarAusencias(admin, { studioId: sesion.studioId, alcance });
      return NextResponse.json({
        items: items.map((a) => ({ id: a.id, tipo: a.tipo, desde: a.desde, hasta: a.hasta, motivo: a.motivo })),
      });
    }

    if (accion === 'crear') {
      const r = await crearAusencia(admin, {
        ...suyo, tipo: body.tipo, desde: body.desde, hasta: body.hasta, motivo: body.motivo,
      });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
      return NextResponse.json({ ok: true, clasesAfectadas: r.clasesAfectadas });
    }

    const r = await borrarAusencia(admin, { studioId: sesion.studioId, id: id as string, alcance });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorInterno('portal/instructora/ausencias:POST', err, 'No hemos podido guardar tu ausencia. Vuelve a intentarlo.');
  }
}
