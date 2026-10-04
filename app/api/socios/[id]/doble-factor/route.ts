import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeGestionarClientas, puedeQuitarVerificacionClienta } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { estadoDobleFactorSocia, quitarDobleFactorSocia } from '@/lib/auth/quitar-doble-factor';
import { MENSAJE_NO_QUITAR } from '@/lib/auth/quitar-doble-factor-reglas';

// La verificación en dos pasos de la cuenta de una alumna, vista desde su ficha.
// GET: si la tiene activada y si este estudio puede quitársela. DELETE: se la
// quita (cuando ha perdido la app y el correo). Reglas en
// lib/auth/quitar-doble-factor-reglas.ts; la ficha tiene que ser de la sede de
// la sesión. Verla: quien gestiona clientas. Quitarla: solo propietaria y
// gerencia (`puedeQuitarVerificacionClienta`), en servidor.

async function sesionConPermiso(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) } as const;
  if (!puedeGestionarClientas(sesion.rol)) {
    return { error: NextResponse.json({ error: 'No tienes permiso para gestionar el acceso de una clienta.' }, { status: 403 }) } as const;
  }
  const admin = getSupabaseAdmin();
  if (!admin) return { error: NextResponse.json({ error: 'Servidor no configurado' }, { status: 500 }) } as const;
  return { sesion, admin } as const;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await sesionConPermiso(req);
  if ('error' in r) return r.error;
  const limited = await enforceRateLimit(req, 'socios-doble-factor-ver', { max: 60, windowSeconds: 60 }, r.sesion.studioId);
  if (limited) return limited;
  const { id } = await params;
  try {
    const e = await estadoDobleFactorSocia(r.admin, r.sesion.studioId, id);
    if (!e.encontrada) return NextResponse.json({ error: 'Clienta no encontrada' }, { status: 404 });
    const sePuedeQuitar = e.activa && e.motivo === null;
    const tienePermiso = puedeQuitarVerificacionClienta(r.sesion.rol);
    return NextResponse.json({
      activa: e.activa,
      sePuedeQuitar: sePuedeQuitar && tienePermiso,
      motivo: e.activa && !sePuedeQuitar && e.motivo ? MENSAJE_NO_QUITAR[e.motivo]
        : sePuedeQuitar && !tienePermiso ? 'Solo la propietaria o la gerencia del estudio pueden quitársela. Pídeselo a ellas.'
          : null,
    });
  } catch (e) {
    return errorInterno('socios/doble-factor:GET', e, 'No hemos podido comprobar su verificación en dos pasos.');
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await sesionConPermiso(req);
  if ('error' in r) return r.error;
  if (!puedeQuitarVerificacionClienta(r.sesion.rol)) {
    return NextResponse.json({ error: 'Solo la propietaria o la gerencia del estudio pueden quitar la verificación.' }, { status: 403 });
  }
  const limited = await enforceRateLimit(req, 'socios-doble-factor-quitar', { max: 10, windowSeconds: 3600 }, r.sesion.studioId);
  if (limited) return limited;
  const { id } = await params;
  try {
    const res = await quitarDobleFactorSocia(r.admin, {
      studioId: r.sesion.studioId,
      socioId: id,
      // Mismo criterio que el resto de Actividad: la propietaria no tiene nombre propio en la sesión.
      actorNombre: r.sesion.rol === 'PROPIETARIO' ? 'Propietaria' : (r.sesion.nombre || null),
    });
    if (!res.ok) {
      if (res.motivo === 'no_encontrada') return NextResponse.json({ error: 'Clienta no encontrada' }, { status: 404 });
      return NextResponse.json({ error: MENSAJE_NO_QUITAR[res.motivo] }, { status: 409 });
    }
    return NextResponse.json({ ok: true, avisada: res.avisada });
  } catch (e) {
    return errorInterno('socios/doble-factor:DELETE', e, 'No hemos podido quitar la verificación. Vuelve a intentarlo.');
  }
}
