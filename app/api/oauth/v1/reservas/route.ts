import { NextRequest } from 'next/server';
import { conOAuth } from '@/lib/oauth-server';
import { crearReservaPublica } from '@/lib/db/supabase-data-admin';

// GET /api/oauth/v1/reservas — triggers "Nueva reserva"/"Reserva cancelada"
// de Zapier (polling). `?estado=` filtra (CONFIRMADA por defecto; pasar
// CANCELADA para el segundo trigger). `?socioId=` filtra además por clienta
// (Fase 9 — extensión incremental, docs/api-publica-v1-diseno.md §3.1): sin
// esto, "las reservas de esta clienta" exigía traer toda la página y filtrar
// en el cliente. Requiere `reservas:leer`.
export async function GET(req: NextRequest) {
  return conOAuth(req, { scope: 'reservas:leer', metodo: 'GET', ruta: '/api/oauth/v1/reservas', rateLimitKey: 'oauth-v1-reservas', rateLimitMax: 60 }, async (ctx, admin) => {
    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 25, 100);
    const estado = req.nextUrl.searchParams.get('estado') ?? 'CONFIRMADA';
    const socioId = req.nextUrl.searchParams.get('socioId');

    let query = admin
      .from('reservas')
      .select('id, sesion_id, socio_id, estado, spot_id, creado_en')
      .eq('studio_id', ctx.studioId)
      .eq('estado', estado);
    if (socioId) query = query.eq('socio_id', socioId);
    const { data, error } = await query.order('creado_en', { ascending: false }).limit(limit);

    if (error) return { status: 500, body: { error: 'server_error' } };
    return {
      status: 200,
      body: (data ?? []).map(r => ({
        id: r.id, sesionId: r.sesion_id, socioId: r.socio_id, estado: r.estado,
        spotId: r.spot_id, creadoEn: r.creado_en,
      })),
    };
  });
}

// POST /api/oauth/v1/reservas — action "Crear reserva" de Zapier. Reutiliza
// crearReservaPublica (mismo camino que /reservar, con todas sus reglas:
// ventana, gate de plan/bono, aforo transaccional). Esa función exige el
// email de la socia para validarla (pensada para JWT de magic link); aquí no
// hay JWT de socia, así que se lee su email de la BD, ya acotado por
// studio_id — el aislamiento lo da el token OAuth, no ese email. Requiere
// `reservas:escribir`.
export async function POST(req: NextRequest) {
  return conOAuth(req, { scope: 'reservas:escribir', metodo: 'POST', ruta: '/api/oauth/v1/reservas', rateLimitKey: 'oauth-v1-reservas-post', rateLimitMax: 20 }, async (ctx, admin) => {
    const body = await req.json().catch(() => null) as {
      socioId?: string; sesionId?: string; spotId?: string;
      socio_id?: string; sesion_id?: string; spot_id?: string;
    } | null;
    const socioId = body?.socioId ?? body?.socio_id;
    const sesionId = body?.sesionId ?? body?.sesion_id;
    const spotId = body?.spotId ?? body?.spot_id;
    if (!socioId || !sesionId) {
      return { status: 400, body: { error: 'invalid_request', detalle: 'socioId y sesionId son obligatorios' } };
    }

    const { data: socio } = await admin
      .from('socios').select('email').eq('id', socioId).eq('studio_id', ctx.studioId).is('borrado_en', null).maybeSingle();
    if (!socio) {
      return { status: 404, body: { error: 'Clienta no encontrada' } };
    }

    const resultado = await crearReservaPublica({
      studioId: ctx.studioId, sesionId, socioId, email: socio.email, spotId,
    });

    if ('error' in resultado) return { status: 400, body: { error: resultado.error } };
    return {
      status: 201,
      body: { id: resultado.reservaId, estado: resultado.estado, spotAsignado: resultado.spotAsignado },
    };
  });
}
