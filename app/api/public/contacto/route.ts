import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { clientIp, enforceRateLimit, rateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { resolverStudioPorSlug } from '@/lib/db/supabase-data-admin';
import { captchaDeServidorListo, verificarCaptcha } from '@/lib/auth/captcha-servidor';
import { CAMPO_TRAMPA, cayoEnLaTrampa } from '@/lib/auth/trampa-bots';
import { paginaCerradaParaPeticion } from '@/lib/publico/pagina-cerrada-peticion';
import { bloqueoPorSuspension } from '@/lib/billing/billing-guard';
import { buzonCanonico } from '@/lib/recursos/descargas';
import { validarConsulta } from '@/lib/contacto/consulta';
import { emitirConsultaContacto } from '@/lib/notifications/emit';

// Widget «Formulario de contacto»: una persona que aún no es clienta escribe al
// estudio desde su web. Se guarda en `consultas_contacto` y se avisa al
// mostrador; se lee y se responde en Clientas.
//
// Orden, y por qué: límites por IP → trampa → validar → captcha → estudio →
// página oculta / suspendido → topes por estudio y buzón → GUARDAR → avisar.
// El captcha va antes de tocar la base: un bot sin token no llega a resolver
// el slug.
//
// Lo que NO hace, a propósito:
// - Nunca crea una ficha en `socios` (le mandaría la bienvenida del portal):
//   pasar a clienta lo decide el mostrador.
// - Nunca manda un correo a la dirección escrita: sería el mismo vector de
//   abuso que obligó a poner topes en /api/public/descargas.
// - Nunca registra el cuerpo ni la fila en los logs (datos de terceros, a veces
//   de salud).
// - Sin CORS: el formulario solo vive en páginas de Tentare (iframe, ventana,
//   enlace); no hay versión nativa que llame desde otro dominio.

const SIN_SERVICIO = 'No hemos podido enviar tu mensaje ahora mismo. Vuelve a intentarlo en un rato.';
/** Consultas al día por estudio: muy por encima de lo real, muy por debajo de un abuso. */
const TOPE_ESTUDIO_DIARIO = 30;
/** Consultas al día desde un mismo buzón al mismo estudio. */
const TOPE_BUZON_DIARIO = 3;

const resumenError = (e: unknown) =>
  e && typeof e === 'object'
    ? { code: (e as { code?: unknown }).code, message: (e as { message?: unknown }).message }
    : { message: String(e) };

const avisadoTope = new Set<string>();

/**
 * ¿Se puede enviar desde aquí? El formulario lo pregunta al abrirse: sin clave
 * de captcha en un entorno desplegado el POST siempre diría que no, y es mejor
 * enseñar el email del estudio que un formulario que nunca envía.
 */
export async function GET() {
  return NextResponse.json({ disponible: captchaDeServidorListo() }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const limitado =
    (await enforceRateLimit(req, 'public-contacto', { max: 3, windowSeconds: 600 })) ??
    (await enforceRateLimit(req, 'public-contacto-dia', { max: 10, windowSeconds: 86_400 }));
  if (limitado) return limitado;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Petición no válida' }, { status: 400 });

  // Un bot que rellena el campo invisible recibe un «sí» y no se guarda nada.
  if (cayoEnLaTrampa(body[CAMPO_TRAMPA])) return NextResponse.json({ ok: true }, { status: 201 });

  const v = validarConsulta(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const c = v.consulta;

  // Escribe en el panel de un tercero y le manda un push: sin captcha que se
  // pueda comprobar, en un entorno desplegado no se guarda nada.
  if (!captchaDeServidorListo()) {
    console.error('[public:contacto] falta TURNSTILE_SECRET_KEY: no se guarda nada sin captcha');
    return NextResponse.json({ error: SIN_SERVICIO }, { status: 503 });
  }
  const captcha = await verificarCaptcha(typeof body.captcha === 'string' ? body.captcha : undefined, { ip: clientIp(req) });
  if (captcha !== 'ok') {
    return NextResponse.json(
      { error: 'No hemos podido comprobar que no eres un robot. Vuelve a intentarlo; si sigue fallando, recarga la página.' },
      { status: 400 },
    );
  }

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: SIN_SERVICIO }, { status: 503 });

  const estudio = await resolverStudioPorSlug(db, c.slug);
  if (!estudio) return NextResponse.json({ error: 'Estudio no encontrado' }, { status: 404 });
  const studioId = estudio.row.id as string;

  const cerrada = await paginaCerradaParaPeticion(req, studioId);
  if (cerrada) return cerrada;
  const bloqueo = await bloqueoPorSuspension(studioId);
  if (bloqueo) return bloqueo;

  const porBuzon = await rateLimit(`contacto-buzon:${studioId}:${buzonCanonico(c.email)}`, { max: TOPE_BUZON_DIARIO, windowSeconds: 86_400 });
  if (!porBuzon.allowed) {
    return NextResponse.json(
      { error: 'Ya has enviado varios mensajes hoy. El estudio te responderá en cuanto pueda.' },
      { status: 429 },
    );
  }
  const porEstudio = await rateLimit(`contacto-estudio:${studioId}`, { max: TOPE_ESTUDIO_DIARIO, windowSeconds: 86_400 });
  if (!porEstudio.allowed) {
    if (!avisadoTope.has(studioId)) {
      avisadoTope.add(studioId);
      Sentry.captureMessage(`[public:contacto] tope de ${TOPE_ESTUDIO_DIARIO} consultas al día alcanzado en un estudio: posible abuso`, {
        level: 'warning', tags: { modulo: 'contacto' }, extra: { studioId },
      });
    }
    return NextResponse.json({ error: SIN_SERVICIO }, { status: 503 });
  }

  const { data: fila, error } = await db
    .from('consultas_contacto')
    .insert({
      studio_id: studioId,
      nombre: c.nombre,
      email: c.email,
      telefono: c.telefono,
      mensaje: c.mensaje,
      origen: c.origen,
      privacidad_aceptada_en: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error || !fila) {
    console.error('[public:contacto] no se ha podido guardar la consulta', resumenError(error));
    return NextResponse.json({ error: SIN_SERVICIO }, { status: 503 });
  }

  await emitirConsultaContacto({ studioId, consultaId: fila.id as string });

  return NextResponse.json({ ok: true }, { status: 201 });
}
