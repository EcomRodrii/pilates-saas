import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { abrirPuertaDelEstudio } from '@/lib/kisi-servidor';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeOperarClase } from '@/lib/permisos-reglas';

// Abre la puerta del estudio vía Kisi al hacer CHECK-IN desde el panel.
// abrirPuertaKisi existía desde el día uno pero ningún flujo la llamaba — la
// integración se podía conectar y probar, pero jamás abría nada. La llama el
// check-in del calendario (studio-context.checkin, fire-and-forget) con la
// clave del propio estudio.
//
// La resolución de cerradura vive en lib/kisi-servidor: la comparte con el pase
// de la clienta, y la parte delicada —con varias cerraduras, "abrir la primera"
// es abrir una puerta cualquiera— no puede existir por duplicado.
//
// Es una puerta física, así que no basta con tener sesión: la apertura va atada
// a la asistencia que se acaba de marcar. La reserva tiene que estar ASISTIDA,
// su clase en curso (desde una hora antes hasta que termina) y quien llama poder
// operar la clase (quien gestiona el calendario; la instructora ya no pasa lista
// desde el panel). Un check-in hecho a posteriori ya no abre nada.
const ANTES_DEL_INICIO_MS = 60 * 60_000;

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'kisi-abrir', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { reservaId?: unknown } | null;
  const reservaId = typeof body?.reservaId === 'string' ? body.reservaId : null;
  if (!reservaId) return NextResponse.json({ ok: false, error: 'Falta la reserva del check-in' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'Servidor no configurado' }, { status: 503 });

  const { data: fila } = await admin
    .from('reservas')
    .select('estado, sesiones!inner(inicio, fin, cancelada)')
    .eq('id', reservaId)
    .eq('studio_id', sesion.studioId)
    .maybeSingle();
  if (!fila) return NextResponse.json({ ok: false, error: 'Reserva no encontrada' }, { status: 404 });

  type Clase = { inicio: string; fin: string | null; cancelada: boolean | null };
  const rel = (fila as unknown as { sesiones: Clase | Clase[] }).sesiones;
  const clase = Array.isArray(rel) ? rel[0] : rel;
  if (!clase) return NextResponse.json({ ok: false, error: 'Reserva no encontrada' }, { status: 404 });

  if (!puedeOperarClase(sesion.rol)) {
    return NextResponse.json({ ok: false, error: 'No tienes permiso para abrir la puerta.' }, { status: 403 });
  }

  const ahora = Date.now();
  const inicio = new Date(clase.inicio).getTime();
  const fin = clase.fin ? new Date(clase.fin).getTime() : inicio + 60 * 60_000;
  const enCurso = ahora >= inicio - ANTES_DEL_INICIO_MS && ahora <= fin;
  if ((fila as { estado: string }).estado !== 'ASISTIDA' || clase.cancelada || !enCurso) {
    return NextResponse.json({ ok: false, error: 'La puerta solo se abre al pasar lista en una clase en curso.' }, { status: 409 });
  }

  const r = await abrirPuertaDelEstudio(sesion.studioId);
  return r.ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ ok: false, error: r.error }, { status: r.status });
}
