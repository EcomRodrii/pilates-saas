import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeGestionarCalendario, puedeGestionarClientas } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { cambiarEstadoPlazaFijaStaff, pausarPlazaFijaStaff } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';

const ESTADOS = ['ACTIVA', 'PAUSADA', 'BAJA'] as const;
type EstadoPlaza = (typeof ESTADOS)[number];

// Pausar, reanudar o quitar una plaza fija desde el panel.
//
// Va por el servidor y no por un UPDATE con RLS desde el navegador porque pausar
// o quitar tiene que SOLTAR las clases que la plaza ya había reservado, y
// cancelarlas bien (promocionar la lista de espera y avisar a quien entra) solo
// lo hace `ejecutarCancelacionReserva`. Antes el estado cambiaba y las reservas
// de las próximas semanas seguían confirmadas.
//
// Con `pausa` ({ desde, hasta } o null para quitarla) no cambia el estado: la
// plaza sigue ACTIVA y con su sitio, se sueltan las clases de esas fechas y el
// motor se las salta (ver lib/plazas-fijas-pausa.ts).
//
// Dos permisos, porque hace dos cosas: cambia la plaza (RLS de `plazas_fijas`,
// `puede_gestionar_clientas`) y cancela reservas con service_role (RLS de
// `reservas`, `puede_gestionar_calendario`). Hoy cubren los mismos roles; si
// algún día se separan, esta ruta no puede dejar cancelar reservas a quien la
// RLS no se lo permitiría. El estudio sale de la sesión, nunca del body.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'plazas-fijas-estado', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarClientas(sesion.rol) || !puedeGestionarCalendario(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para cambiar plazas fijas' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { plazaId?: unknown; estado?: unknown; pausa?: unknown } | null;
  const plazaId = typeof body?.plazaId === 'string' ? body.plazaId : '';

  if (body && typeof body === 'object' && 'pausa' in body) {
    const p = body.pausa as { desde?: unknown; hasta?: unknown } | null;
    const pausa = p === null
      ? null
      : p && typeof p === 'object' && typeof p.desde === 'string' && typeof p.hasta === 'string'
        ? { desde: p.desde, hasta: p.hasta }
        : undefined;
    if (!plazaId || pausa === undefined) return NextResponse.json({ error: 'Faltan la plaza fija o las fechas de la pausa' }, { status: 400 });

    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
    try {
      const r = await pausarPlazaFijaStaff(admin, { studioId: sesion.studioId, plazaId, pausa });
      if ('error' in r) {
        return NextResponse.json({ error: r.error }, { status: r.error === 'Plaza fija no encontrada' ? 404 : 400 });
      }
      return NextResponse.json(r);
    } catch (err) {
      return errorInterno('plazas-fijas/estado:POST', err, 'No se ha podido guardar la pausa.');
    }
  }

  const estado = ESTADOS.find(e => e === body?.estado) as EstadoPlaza | undefined;
  if (!plazaId || !estado) return NextResponse.json({ error: 'Falta la plaza fija o el estado' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    const r = await cambiarEstadoPlazaFijaStaff(admin, { studioId: sesion.studioId, plazaId, estado });
    if ('error' in r) {
      return NextResponse.json({ error: r.error }, { status: r.error === 'Plaza fija no encontrada' ? 404 : 400 });
    }
    return NextResponse.json(r);
  } catch (err) {
    return errorInterno('plazas-fijas/estado:POST', err, 'No se ha podido cambiar la plaza fija.');
  }
}
