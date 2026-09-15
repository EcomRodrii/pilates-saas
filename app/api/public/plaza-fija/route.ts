import { NextRequest, NextResponse } from 'next/server';
import {
  cancelarPeticionPlazaFijaAlumna, socioAutenticado, solicitarPausaPlazaFijaAlumna, solicitarPlazaFijaAlumna,
} from '@/lib/db/supabase-data-admin';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { paginaCerradaParaPeticion } from '@/lib/publico/pagina-cerrada-peticion';

// Plaza fija desde la app de la alumna: PIDE y el estudio decide
// (`solicitudes_plaza_fija`, migr 20260916120000). Antes creaba, pausaba,
// reanudaba y quitaba su plaza ella sola. Decisión del fundador (16-sep-2026):
// hasta que el estudio aprueba no cambia la plaza real, y cada puerta la abre su
// ajuste del estudio (apagado, 403). Quitar o reanudar se habla con el estudio.
// SEGURIDAD: igual que /api/public/reserva, la identidad sale del JWT
// verificado, nunca del body — nadie pide nada sobre la plaza fija de otra
// socia conociendo su id.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-plaza-fija', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as {
    accion?: unknown;
    studioId?: string;
    sesionId?: unknown;
    plazaId?: unknown;
    desde?: unknown;
    hasta?: unknown;
    solicitudId?: unknown;
  } | null;

  if (!body?.studioId) {
    return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });
  }

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, body.studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const texto = (v: unknown) => (typeof v === 'string' && v ? v : null);

  try {
    if (body.accion === 'solicitar_plaza') {
      // Una plaza fija son reservas cada semana: con la página oculta, desde fuera no.
      const cerrada = await paginaCerradaParaPeticion(req, body.studioId);
      if (cerrada) return cerrada;
      const sesionId = texto(body.sesionId);
      if (!sesionId) return NextResponse.json({ error: 'Falta la clase' }, { status: 400 });
      const r = await solicitarPlazaFijaAlumna(admin, { studioId: body.studioId, socioId, sesionId });
      return 'error' in r ? NextResponse.json({ error: r.error }, { status: r.status }) : NextResponse.json(r);
    }
    if (body.accion === 'solicitar_pausa') {
      const plazaId = texto(body.plazaId);
      const desde = texto(body.desde);
      const hasta = texto(body.hasta);
      if (!plazaId || !desde || !hasta) return NextResponse.json({ error: 'Faltan la plaza fija o las fechas de la pausa' }, { status: 400 });
      const r = await solicitarPausaPlazaFijaAlumna(admin, { studioId: body.studioId, socioId, plazaId, desde, hasta });
      return 'error' in r ? NextResponse.json({ error: r.error }, { status: r.status }) : NextResponse.json(r);
    }
    if (body.accion === 'cancelar_peticion') {
      const solicitudId = texto(body.solicitudId);
      if (!solicitudId) return NextResponse.json({ error: 'Falta la petición' }, { status: 400 });
      const r = await cancelarPeticionPlazaFijaAlumna(admin, { studioId: body.studioId, socioId, solicitudId });
      return 'error' in r ? NextResponse.json({ error: r.error }, { status: r.status }) : NextResponse.json(r);
    }
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (err) {
    return errorInterno('public/plaza-fija:POST', err, 'No se ha podido enviar la petición de plaza fija.');
  }
}
