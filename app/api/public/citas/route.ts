import { NextRequest, NextResponse } from 'next/server';
import {
  fetchHuecosCitaPublico, crearCitaPublica, cancelarCitaPublica, socioAutenticado,
} from '@/lib/supabase-data';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';

// Huecos reservables de una instructora para un servicio y un día (Madrid). No
// requiere sesión: consultar disponibilidad es público (como el horario de
// clases). No expone PII — solo horas libres. Rate-limitado contra scraping.
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-citas-huecos', { max: 60, windowSeconds: 60 });
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const studioId = searchParams.get('studioId');
  const servicioId = searchParams.get('servicioId');
  const instructorId = searchParams.get('instructorId');
  const fecha = searchParams.get('fecha'); // YYYY-MM-DD (Madrid)
  if (!studioId || !servicioId || !instructorId || !fecha) {
    return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: 'Fecha no válida' }, { status: 400 });
  }

  try {
    const r = await fetchHuecosCitaPublico({ studioId, servicioId, instructorId, fechaLocal: fecha });
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json(r);
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'Error al calcular disponibilidad';
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}

// Crear o cancelar una cita 1:1 desde las páginas públicas. SEGURIDAD idéntica a
// /api/public/reserva: exige sesión real de socia (JWT de Supabase Auth) y deriva
// su id del token verificado — nunca del body.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-citas', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as {
    accion?: 'crear' | 'cancelar';
    studioId?: string;
    servicioId?: string;
    instructorId?: string;
    inicioISO?: string;
    citaId?: string;
  } | null;

  if (!body?.studioId) {
    return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });
  }

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, body.studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    if (body.accion === 'crear') {
      if (!body.servicioId || !body.instructorId || !body.inicioISO) {
        return NextResponse.json({ error: 'Faltan datos de la cita' }, { status: 400 });
      }
      const r = await crearCitaPublica({
        studioId: body.studioId, servicioId: body.servicioId, instructorId: body.instructorId,
        inicioISO: body.inicioISO, socioId, email: user.email,
      });
      if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.error === 'No autorizado' ? 401 : 400 });
      return NextResponse.json(r);
    }
    if (body.accion === 'cancelar') {
      if (!body.citaId) return NextResponse.json({ error: 'Falta la cita' }, { status: 400 });
      const r = await cancelarCitaPublica({
        studioId: body.studioId, citaId: body.citaId, socioId, email: user.email,
      });
      if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.error === 'No autorizado' ? 401 : 400 });
      return NextResponse.json(r);
    }
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'Error al procesar la cita';
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
