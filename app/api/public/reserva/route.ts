import { NextRequest, NextResponse } from 'next/server';
import { crearReservaPublica, cancelarReservaPublica, valorarExperienciaReservaPublica, socioAutenticado } from '@/lib/db/supabase-data-admin';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { respuestaPreflightWidget, conCorsWidget } from '@/lib/cors-widget';

// Crear o cancelar una reserva desde las páginas públicas (reserva/portal).
// SEGURIDAD: exige sesión real de socia (JWT de Supabase Auth) y deriva su id
// del token verificado — ya NO se acepta {socioId,email} del body, así nadie
// puede reservar/cancelar en nombre de otra socia conociendo su id+email.
//
// CORS: el bundle embebible manda ?studioId= en la URL (además del body) para
// que el preflight pueda resolver la lista blanca sin leer el body.
export async function OPTIONS(req: NextRequest) {
  return respuestaPreflightWidget(req);
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-reserva', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as {
    accion?: 'crear' | 'cancelar' | 'valorar';
    studioId?: string;
    sesionId?: string;
    reservaId?: string;
    spotId?: string | null;
    valoracion?: number;
  } | null;

  if (!body?.studioId) {
    return conCorsWidget(req, NextResponse.json({ error: 'Falta el estudio' }, { status: 400 }));
  }

  const user = await verificarUsuarioSupabase(req);
  if (!user) return conCorsWidget(req, NextResponse.json({ error: 'No autorizado' }, { status: 401 }));
  const socioId = await socioAutenticado(user.userId, body.studioId);
  if (!socioId) return conCorsWidget(req, NextResponse.json({ error: 'No autorizado' }, { status: 401 }));

  // El `codigo` del rechazo VIAJA al cliente además del texto: sin él, el
  // `switch` de lib/student/reserva-codigos.ts caía siempre en el `default`
  // y la app de la alumna pintaba «algo ha fallado, inténtalo de nuevo» para
  // TODO — clase completa, reserva duplicada, choque de horario— además de
  // reportar a Sentry cada rechazo normal de negocio como si fuera una avería.
  try {
    if (body.accion === 'crear') {
      if (!body.sesionId) return conCorsWidget(req, NextResponse.json({ error: 'Falta la sesión' }, { status: 400 }));
      const r = await crearReservaPublica({
        studioId: body.studioId, sesionId: body.sesionId, socioId, authUserId: user.userId, spotId: body.spotId ?? null,
      });
      if ('error' in r) return conCorsWidget(req, NextResponse.json({ error: r.error, ...('codigo' in r ? { codigo: r.codigo } : {}) }, { status: r.error === 'No autorizado' ? 401 : 400 }));
      return conCorsWidget(req, NextResponse.json(r));
    }
    if (body.accion === 'cancelar') {
      if (!body.reservaId) return conCorsWidget(req, NextResponse.json({ error: 'Falta la reserva' }, { status: 400 }));
      const r = await cancelarReservaPublica({
        studioId: body.studioId, reservaId: body.reservaId, socioId, authUserId: user.userId,
      });
      if ('error' in r) return conCorsWidget(req, NextResponse.json({ error: r.error, ...('codigo' in r ? { codigo: r.codigo } : {}) }, { status: r.error === 'No autorizado' ? 401 : 400 }));
      return conCorsWidget(req, NextResponse.json(r));
    }
    if (body.accion === 'valorar') {
      if (!body.reservaId) return conCorsWidget(req, NextResponse.json({ error: 'Falta la reserva' }, { status: 400 }));
      if (typeof body.valoracion !== 'number') return conCorsWidget(req, NextResponse.json({ error: 'Falta la valoración' }, { status: 400 }));
      const r = await valorarExperienciaReservaPublica({
        studioId: body.studioId, reservaId: body.reservaId, socioId, authUserId: user.userId, valoracion: body.valoracion,
      });
      if ('error' in r) return conCorsWidget(req, NextResponse.json({ error: r.error, ...('codigo' in r ? { codigo: r.codigo } : {}) }, { status: r.error === 'No autorizado' ? 401 : 400 }));
      return conCorsWidget(req, NextResponse.json(r));
    }
    return conCorsWidget(req, NextResponse.json({ error: 'Acción no válida' }, { status: 400 }));
  } catch (err) {
    return conCorsWidget(req, errorInterno('public/reserva:POST', err, 'No se ha podido procesar la reserva.'));
  }
}
