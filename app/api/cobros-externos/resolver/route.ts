import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { enforceRateLimit } from '@/lib/rate-limit';
import { guardaAntesDeCobrar } from '@/lib/cobros/antes-de-cobrar-a-mano-servidor';
import { estadoHttpDeResultado, parsearPeticionResolver } from '@/lib/cobros-externos/peticiones';
import {
  confirmarMovimiento, descartarMovimiento, enlazarMovimiento, marcarDobleCobro, reabrirMovimiento,
  type ResultadoAccion, type SesionBandeja,
} from '@/lib/cobros-externos/servidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ─────────────────────────────────────────────────────────────────────────────
// Resolver UN movimiento de la bandeja de cobros externos:
//   · confirmar  → cobra el recibo por `confirmarCobro()` (origen 'externo'),
//                  con cerrojo y la guarda de «Marcar cobrado» antes;
//   · enlazar    → es el pago de un cobro ya apuntado a mano (no toca el recibo);
//   · descartar  → no es de una alumna, duplicado, devuelto… con motivo;
//   · reabrir    → un descartado vuelve a revisión;
//   · doble_cobro→ la alumna pagó dos veces: hay que devolver uno.
//
// Uno por petición: lo decide una persona mirando cada movimiento. Solo quien
// mueve dinero; el estudio, la persona y su rol salen SIEMPRE de la sesión, y la
// sesión entera es el actor del libro.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeMoverDinero(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede registrar cobros' }, { status: 403 });
  }
  const limitado = await enforceRateLimit(req, 'cobros-externos-resolver', { max: 60, windowSeconds: 60 }, sesion.userId);
  if (limitado) return limitado;

  const parseo = parsearPeticionResolver(await req.json().catch(() => null));
  if (!parseo.ok) return NextResponse.json({ error: parseo.error }, { status: 400 });
  const peticion = parseo.peticion;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const bandeja: SesionBandeja = { userId: sesion.userId, studioId: sesion.studioId, rol: sesion.rol, nombre: sesion.nombre };
  let r: ResultadoAccion;
  switch (peticion.accion) {
    case 'confirmar':
      r = await confirmarMovimiento(admin, {
        sesion: bandeja, movimientoId: peticion.movimientoId, reciboId: peticion.reciboId, avisarSocia: peticion.avisarSocia,
        aunqueDuplicado: peticion.aunqueDuplicado,
      }, { antesDeCobrar: guardaAntesDeCobrar(admin, sesion.studioId) });
      break;
    case 'enlazar':
      r = await enlazarMovimiento(admin, { sesion: bandeja, movimientoId: peticion.movimientoId, reciboId: peticion.reciboId });
      break;
    case 'doble_cobro':
      r = await marcarDobleCobro(admin, { sesion: bandeja, movimientoId: peticion.movimientoId, reciboId: peticion.reciboId });
      break;
    case 'descartar':
      r = await descartarMovimiento(admin, { sesion: bandeja, movimientoId: peticion.movimientoId, motivo: peticion.motivo });
      break;
    case 'reabrir':
      r = await reabrirMovimiento(admin, { sesion: bandeja, movimientoId: peticion.movimientoId });
      break;
  }

  if (!r.ok && r.codigo === 'PERSISTENCIA') {
    Sentry.captureMessage('[cobros-externos] no se ha podido resolver un movimiento', {
      level: 'error', tags: { area: 'cobros', tipo: 'cobros-externos' },
      extra: { studioId: sesion.studioId, accion: peticion.accion, movimientoId: peticion.movimientoId },
    });
  }
  return r.ok
    ? NextResponse.json({ estado: r.estado, ...(r.mensaje ? { mensaje: r.mensaje } : {}) })
    : NextResponse.json({ error: r.error, codigo: r.codigo }, { status: estadoHttpDeResultado(r.codigo) });
}
