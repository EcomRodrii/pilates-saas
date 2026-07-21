import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { verificarTokenConfirmacion } from '@/lib/confirmacion-riesgo/token';

// Endpoint PÚBLICO (sin login): la socia confirma desde el deep link que viene
// a su clase, sin más. El token ES la autorización (scope 'confirmar_reserva',
// ligado a socioId+reservaId+studioId). Escritura con service-role, pero
// SIEMPRE acotada al socio_id que viaja firmado en el token.

function cuandoTexto(inicio: string): string {
  const d = new Date(inicio);
  const fecha = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  return `${fecha.charAt(0).toUpperCase()}${fecha.slice(1)} · ${hora}`;
}

// GET ?token=... → datos para pintar la página (nombre, clase, si ya confirmó
// o si la reserva ya no está en pie).
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-confirmacion-reserva-get', { max: 60, windowSeconds: 60 });
  if (limited) return limited;

  const token = req.nextUrl.searchParams.get('token');
  const claim = verificarTokenConfirmacion(token);
  if (!claim) return NextResponse.json({ error: 'Enlace no válido o caducado' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const { data: reserva } = await admin
    .from('reservas').select('estado, socio_id, sesion_id, confirmado_en')
    .eq('id', claim.reservaId).eq('studio_id', claim.studioId).maybeSingle();
  if (!reserva || reserva.socio_id !== claim.socioId) {
    return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });
  }

  const { data: socia } = await admin
    .from('socios').select('nombre').eq('id', claim.socioId).maybeSingle();
  const { data: ses } = await admin
    .from('sesiones').select('inicio, tipo_clase_id').eq('id', reserva.sesion_id).maybeSingle();
  const { data: tipo } = ses?.tipo_clase_id
    ? await admin.from('tipos_clase').select('nombre').eq('id', ses.tipo_clase_id).maybeSingle()
    : { data: null };
  const { data: estudio } = await admin
    .from('studios').select('nombre').eq('id', claim.studioId).maybeSingle();

  return NextResponse.json({
    socioNombre: socia?.nombre ?? '',
    estudioNombre: estudio?.nombre ?? '',
    claseNombre: tipo?.nombre ?? 'Clase',
    cuando: ses?.inicio ? cuandoTexto(ses.inicio as string) : '',
    yaConfirmado: !!reserva.confirmado_en,
    // La reserva ya no está en pie: se liberó (cutoff) o se resolvió de otra
    // forma antes de que confirmara. Distinto de "ya confirmado" — aquí no hay
    // nada que hacer, solo explicarlo.
    yaResuelta: reserva.estado !== 'CONFIRMADA',
  });
}

// POST { token } → marca confirmado_en. Idempotente: confirmar dos veces no
// rompe nada, y si la reserva ya no está en pie (se liberó antes de que
// respondiera) se dice la verdad en vez de fingir que sirvió de algo.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-confirmacion-reserva-post', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { token?: string } | null;
  const claim = verificarTokenConfirmacion(body?.token);
  if (!claim) return NextResponse.json({ error: 'Enlace no válido o caducado' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const { data: reserva } = await admin
    .from('reservas').select('estado, socio_id, confirmado_en')
    .eq('id', claim.reservaId).eq('studio_id', claim.studioId).maybeSingle();
  if (!reserva || reserva.socio_id !== claim.socioId) {
    return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });
  }
  if (reserva.confirmado_en) return NextResponse.json({ ok: true, yaConfirmado: true });
  if (reserva.estado !== 'CONFIRMADA') {
    return NextResponse.json({ ok: false, yaResuelta: true });
  }

  // Compare-and-set: solo si sigue CONFIRMADA y sin confirmar. Si el barrido de
  // corte la liberó justo en este instante, esto no toca nada (0 filas) y el
  // siguiente GET dirá la verdad (yaResuelta).
  const { data: actualizada, error } = await admin
    .from('reservas').update({ confirmado_en: new Date().toISOString() })
    .eq('id', claim.reservaId).eq('estado', 'CONFIRMADA').is('confirmado_en', null)
    .select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!actualizada || actualizada.length === 0) {
    return NextResponse.json({ ok: false, yaResuelta: true });
  }

  return NextResponse.json({ ok: true, yaConfirmado: true });
}
