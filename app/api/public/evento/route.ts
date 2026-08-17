import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { registrarEventoWidget } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { esTipoEventoValido } from '@/lib/reservar/eventos';
import { respuestaPreflightWidget, conCorsWidget } from '@/lib/cors-widget';

// Fase 2 "Growth Widget": recibe los eventos anónimos del funnel del widget
// público (ver lib/reservar/eventos.ts para el catálogo y el helper de
// cliente). Sin PII: `sessionId` es del navegador de la visitante, nunca un
// id de socia — no hace falta JWT ni comprobar a quién pertenece.
//
// Fire-and-forget desde el cliente (no espera la respuesta, usa `keepalive`):
// este endpoint SIEMPRE responde 200 salvo un body claramente inválido — un
// fallo de analítica nunca debe convertirse en ruido visible para nadie.
export async function OPTIONS(req: NextRequest) {
  return respuestaPreflightWidget(req);
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-evento', { max: 120, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as {
    studioId?: string;
    sessionId?: string;
    tipo?: string;
    sesionClaseId?: string | null;
    origen?: string | null;
    // Fase 8 (CRO): solo poblado por el cliente en los eventos donde la
    // visitante ya está identificada — ver lib/reservar/eventos.ts.
    socioId?: string | null;
  } | null;

  if (!body?.studioId || !body.sessionId || !body.tipo || !esTipoEventoValido(body.tipo)) {
    return conCorsWidget(req, NextResponse.json({ error: 'Datos de evento inválidos' }, { status: 400 }));
  }

  const admin = getSupabaseAdmin();
  // Sin service-role configurada (entorno local sin la variable) no hay
  // dónde escribir — no es un error para quien llama, solo no se registra.
  if (!admin) return conCorsWidget(req, NextResponse.json({ ok: true }));

  registrarEventoWidget(admin, {
    studioId: body.studioId,
    sessionId: body.sessionId,
    tipo: body.tipo,
    sesionClaseId: body.sesionClaseId ?? null,
    origen: body.origen ?? null,
    socioId: body.socioId ?? null,
  });

  return conCorsWidget(req, NextResponse.json({ ok: true }));
}
