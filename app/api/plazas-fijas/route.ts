import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeGestionarCalendario, puedeGestionarClientas } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { guardarPlazaFijaStaff } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import type { DatosPlazaFija, ResultadoGuardarPlazaFija } from '@/lib/plazas-fijas-reglas';

export const dynamic = 'force-dynamic';

// Crear (POST) o mover (PATCH) una plaza fija desde el panel.
//
// Antes el navegador insertaba la fila con RLS y reservaba la primera clase con
// `addReserva` (una reserva normal, que descuenta bono), mientras las de cada
// noche las creaba el motor sin descontar nada. Ahora todo pasa por el servidor:
// la franja se deduce de UNA clase del horario (nunca de día/hora tecleados), se
// comprueba la cuota y el límite semanal, y el MISMO motor reserva ya las
// próximas semanas y meses (`materializar_plazas_fijas` con `p_plaza_id`, 180 días).
//
// Mismos dos permisos que `app/api/plazas-fijas/estado`: cambia la plaza (RLS de
// `plazas_fijas`) y, al mover, cancela reservas del horario viejo (RLS de
// `reservas`). La RLS de INSERT/UPDATE sigue siendo la segunda cerradura. El
// estudio sale de la sesión, nunca del body.

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function leerDatos(body: Record<string, unknown> | null): Omit<DatosPlazaFija, 'socioId'> | null {
  if (!body) return null;
  const sesionId = typeof body.sesionId === 'string' ? body.sesionId : '';
  const vigenciaDesde = typeof body.vigenciaDesde === 'string' && RE_FECHA.test(body.vigenciaDesde) ? body.vigenciaDesde : '';
  const vigenciaHasta = typeof body.vigenciaHasta === 'string' && RE_FECHA.test(body.vigenciaHasta) ? body.vigenciaHasta : null;
  if (!sesionId || !vigenciaDesde) return null;
  return {
    sesionId, vigenciaDesde, vigenciaHasta,
    spotId: typeof body.spotId === 'string' && body.spotId ? body.spotId : null,
    confirmarLimite: body.confirmarLimite === true,
  };
}

function responder(r: ResultadoGuardarPlazaFija) {
  if (r.ok) return NextResponse.json(r);
  const status = r.codigo === 'SUPERA_LIMITE' ? 409 : /no encontrada/i.test(r.error) ? 404 : 400;
  return NextResponse.json(r, { status });
}

async function manejar(req: NextRequest, metodo: 'POST' | 'PATCH') {
  const limited = await enforceRateLimit(req, 'plazas-fijas-guardar', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarClientas(sesion.rol) || !puedeGestionarCalendario(sesion.rol)) {
    return NextResponse.json({ ok: false, error: 'No tienes permiso para cambiar plazas fijas' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const datos = leerDatos(body);
  const socioId = typeof body?.socioId === 'string' ? body.socioId : '';
  const plazaId = typeof body?.plazaId === 'string' ? body.plazaId : '';
  if (!datos || (metodo === 'POST' && !socioId) || (metodo === 'PATCH' && !plazaId)) {
    return NextResponse.json({ ok: false, error: 'Faltan la clase, la clienta o las fechas' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'Servidor no configurado' }, { status: 503 });

  try {
    const r = await guardarPlazaFijaStaff(admin, {
      studioId: sesion.studioId,
      datos: { ...datos, socioId },
      plazaId: metodo === 'PATCH' ? plazaId : undefined,
    });
    return responder(r);
  } catch (err) {
    return errorInterno(`plazas-fijas:${metodo}`, err, 'No se ha podido guardar la plaza fija.');
  }
}

export function POST(req: NextRequest) {
  return manejar(req, 'POST');
}

export function PATCH(req: NextRequest) {
  return manejar(req, 'PATCH');
}
