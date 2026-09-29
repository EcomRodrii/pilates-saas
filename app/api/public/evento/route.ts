import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { registrarEventoWidget, socioAutenticado } from '@/lib/db/supabase-data-admin';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { esTipoEventoValido } from '@/lib/reservar/eventos';
import { respuestaPreflightWidget, conCorsWidget, origenPermitido } from '@/lib/cors-widget';
import { pegadoDelEvento, propiosDeLaPeticion } from '@/lib/widgets/evento-pegado';
import { esOrigenDeTentare } from '@/lib/widgets/pegado';

// Fase 2 "Growth Widget": recibe los eventos anónimos del funnel del widget
// público (ver lib/reservar/eventos.ts para el catálogo y el helper de
// cliente). Sin PII por defecto: `sessionId` es del navegador de la
// visitante, nunca un id de socia.
//
// Fase 8 (CRO): 4 de los 13 tipos (booking_started/checkout_started/
// booking_completed/booking_abandoned) SÍ pueden llevar `socioId` — sigue
// sin JWT para la ATRIBUCIÓN de analítica (fire-and-forget, rate limit
// 120/min): un `socioId` ajeno mandado a mano no puede leer ni mover nada de
// otra socia/estudio, como mucho ensucia `widget_eventos.socio_id`.
//
// C-4 (auditoría 29-ago), cerrado: lo que SÍ tenía efecto real sin JWT era
// disparar el email de RESERVA_ABANDONADA a cualquier socia de la que se
// conociera el id (`socioId` es público — `fetchPublicStudioData` los
// expone). Ahora ese disparo exige demostrar con el JWT (si lo hay) que
// quien llama es de verdad esa socia — `socioAutenticado` resuelve el id
// real desde `auth.uid()`+`studioId` y se compara contra el `socioId` del
// body. Riesgo original documentado en docs/cro-analytics-widget-diseno.md
// §5.2/§7.3.
//
// Fase C del constructor de widgets: `widget_loaded` dice además dónde está
// pegado (forma, anfitrión y firma de la versión). Todo lo decide
// `pegadoDelEvento` (lib/widgets/evento-pegado.ts): la nativa la reconoce aquí
// el servidor por la cabecera Origin, y desde la Fase E manda en el cuerpo su
// firma (la calcula el bundle de sus `data-*`); el iframe y el popup los
// cuenta la página en el cuerpo. Botón y enlace no mandan nada, a propósito.
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
    // Fase C: solo en `widget_loaded` de un iframe o un popup; la nativa, solo
    // `firma` (Fase E). Sin validar aquí: lo filtra `pegadoDelEvento`, que
    // decide también cuándo no cuentan.
    forma?: unknown;
    anfitrion?: unknown;
    firma?: unknown;
  } | null;

  if (!body?.studioId || !body.sessionId || !body.tipo || !esTipoEventoValido(body.tipo)) {
    return conCorsWidget(req, NextResponse.json({ error: 'Datos de evento inválidos' }, { status: 400 }));
  }

  // 51ª pasada de auditoría: la lista blanca de widget_dominios_autorizados
  // (cors-widget.ts) NO se comprueba aquí a propósito — es CORS, decide qué
  // cabecera devolver, no si se escribe. Un curl con cualquier studioId
  // real escribe igual, sin pasar por la lista. Riesgo asumido: es
  // analítica anónima de bajo impacto (ensucia widget_eventos como mucho,
  // nunca dinero ni PII), acotada por enforceRateLimit de arriba.
  const admin = getSupabaseAdmin();
  // Sin service-role configurada (entorno local sin la variable) no hay
  // dónde escribir — no es un error para quien llama, solo no se registra.
  if (!admin) return conCorsWidget(req, NextResponse.json({ ok: true }));

  // C-4: solo se resuelve si hace falta (booking_abandoned con socioId) — el
  // resto de tipos ni intenta verificar un JWT que no necesitan.
  let socioIdVerificado: string | null = null;
  if (body.tipo === 'booking_abandoned' && body.socioId) {
    const usuario = await verificarUsuarioSupabase(req);
    if (usuario) {
      const idReal = await socioAutenticado(usuario.userId, body.studioId);
      if (idReal === body.socioId) socioIdVerificado = body.socioId;
    }
  }

  // La nativa llama con `?studioId=` en la URL (el preflight CORS no puede
  // leer el cuerpo); su anfitrión es la cabecera Origin, nunca el cuerpo. Y
  // solo cuenta si esa web la autorizó el MISMO estudio del cuerpo: la misma
  // consulta que decide el CORS, y solo cuando puede ser una nativa.
  const origenCabecera = req.headers.get('origin');
  const studioIdEnUrl = req.nextUrl.searchParams.get('studioId');
  const propios = propiosDeLaPeticion(req.nextUrl.origin);
  const puedeSerNativa = body.tipo === 'widget_loaded' && !!studioIdEnUrl && !!origenCabecera
    && !esOrigenDeTentare(origenCabecera, propios);
  const nativaAutorizada = puedeSerNativa && studioIdEnUrl === body.studioId
    && (await origenPermitido({ studioId: body.studioId }, origenCabecera)) !== null;
  const pegado = pegadoDelEvento({
    tipo: body.tipo,
    cuerpo: { forma: body.forma, anfitrion: body.anfitrion, firma: body.firma },
    studioIdEnUrl: !!studioIdEnUrl,
    origenCabecera,
    propios,
    nativaAutorizada,
  });

  registrarEventoWidget(admin, {
    studioId: body.studioId,
    sessionId: body.sessionId,
    tipo: body.tipo,
    sesionClaseId: body.sesionClaseId ?? null,
    origen: body.origen ?? null,
    socioId: body.socioId ?? null,
    socioIdVerificado,
    ...pegado,
  });

  return conCorsWidget(req, NextResponse.json({ ok: true }));
}
