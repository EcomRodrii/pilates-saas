import { NextRequest } from 'next/server';
import { conOAuth } from '@/lib/oauth-server';
import { cancelarReservaPublica } from '@/lib/db/supabase-data-admin';

// POST /api/oauth/v1/reservas/cancelar — action "Cancelar reserva" de
// Zapier. Reutiliza cancelarReservaPublica (mismo camino que /reservar:
// devuelve bono si procede, promueve lista de espera, APLICA la penalización
// por cancelación tardía si el estudio la tiene activada — nunca
// omitirPenalizacion, esto es una cancelación real, no un corte automático
// del sistema). Requiere `reservas:escribir`.
export async function POST(req: NextRequest) {
  return conOAuth(req, { scope: 'reservas:escribir', metodo: 'POST', ruta: '/api/oauth/v1/reservas/cancelar', rateLimitKey: 'oauth-v1-reservas-cancelar', rateLimitMax: 20 }, async (ctx, admin) => {
    const body = await req.json().catch(() => null) as { reservaId?: string; reserva_id?: string } | null;
    const reservaId = body?.reservaId ?? body?.reserva_id;
    if (!reservaId) return { status: 400, body: { error: 'invalid_request', detalle: 'reservaId es obligatorio' } };

    // La reserva trae el socio_id — se resuelve aquí para no exigirle a Zapier
    // que sepa de quién es, y de paso confirma que pertenece a este estudio.
    const { data: reserva } = await admin
      .from('reservas').select('socio_id').eq('id', reservaId).eq('studio_id', ctx.studioId).maybeSingle();
    if (!reserva?.socio_id) {
      return { status: 404, body: { error: 'Reserva no encontrada' } };
    }

    const { data: socio } = await admin
      .from('socios').select('email').eq('id', reserva.socio_id).eq('studio_id', ctx.studioId).maybeSingle();
    if (!socio) return { status: 404, body: { error: 'Clienta no encontrada' } };

    const resultado = await cancelarReservaPublica({
      studioId: ctx.studioId, reservaId, socioId: reserva.socio_id, email: socio.email,
    });

    if ('error' in resultado) return { status: 400, body: { error: resultado.error } };
    return {
      status: 200,
      body: { ok: true, tardia: resultado.tardia, bonoDevuelto: resultado.bonoDevuelto, recuperacionCreada: resultado.recuperacionCreada },
    };
  });
}
