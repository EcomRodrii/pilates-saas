import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { Resend } from 'resend';
import { LEGAL } from '@/lib/legal-info';
import { clientIp, enforceRateLimit, rateLimit } from '@/lib/rate-limit';
import { captchaDeServidorListo, verificarCaptcha } from '@/lib/auth/captcha-servidor';
import { CAMPO_TRAMPA, cayoEnLaTrampa } from '@/lib/auth/trampa-bots';
import { buzonCanonico } from '@/lib/recursos/descargas';
import { correoSolicitudDemo, validarSolicitudDemo } from '@/lib/contacto/solicitud-demo';
import { remitentePorMarca } from '@/lib/emails/remitente';

// El formulario de contacto de la home («Pedir una demo»). Antes abría el cliente de correo de quien lo rellenaba (`mailto:`): en un móvil
// sin correo configurado el mensaje se perdía y no quedaba medida de cuántos llegaban.
//
// Orden, y por qué: límites por IP → trampa → validar → captcha → topes por buzón y global → ENVIAR. El captcha va antes de mandar nada:
// un bot sin token no llega a gastar el remitente de Resend (el mismo del resto del correo del producto).
//
// ⚠️ Aquí NO se guarda en `plataforma_lead` (su CHECK de `origen` no tiene un valor para esto: hace falta una migración, que es decisión
// aparte). El correo es el registro, y por eso un correo que no sale es un ERROR para la visitante: decirle «recibido» sería mentirle.
// Nunca se registra el cuerpo ni la dirección en los logs (datos de un tercero).

const SIN_SERVICIO = 'No hemos podido enviar tu mensaje ahora mismo. Escríbenos a hola@tentare.app o vuelve a intentarlo en un rato.';
/** Solicitudes al día entre todas: muy por encima de lo real, muy por debajo de un abuso. */
const TOPE_GLOBAL_DIARIO = 100;

let avisadoTopeGlobal = false;

/** ¿Se puede enviar desde aquí? Sin clave de captcha en un entorno desplegado el POST diría siempre que no: el formulario lo pregunta al montarse y, si no, usa el correo del cliente. */
export async function GET() {
  const apiKey = process.env.RESEND_API_KEY;
  const correo = Boolean(apiKey) && !apiKey!.startsWith('re_XXXX');
  return NextResponse.json({ disponible: captchaDeServidorListo() && correo }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const limitado =
    (await enforceRateLimit(req, 'public-solicitar-demo', { max: 3, windowSeconds: 600 })) ??
    (await enforceRateLimit(req, 'public-solicitar-demo-dia', { max: 10, windowSeconds: 86_400 }));
  if (limitado) return limitado;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Petición no válida' }, { status: 400 });

  // Un bot que rellena el campo invisible recibe un «sí» y no se envía nada.
  if (cayoEnLaTrampa(body[CAMPO_TRAMPA])) return NextResponse.json({ ok: true });

  const v = validarSolicitudDemo(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  if (!captchaDeServidorListo()) {
    console.error('[public:solicitar-demo] falta TURNSTILE_SECRET_KEY: no se envía nada sin captcha');
    return NextResponse.json({ error: SIN_SERVICIO }, { status: 503 });
  }
  const captcha = await verificarCaptcha(typeof body.captcha === 'string' ? body.captcha : undefined, { ip: clientIp(req) });
  if (captcha !== 'ok') {
    return NextResponse.json(
      { error: 'No hemos podido comprobar que no eres un robot. Vuelve a intentarlo; si sigue fallando, recarga la página.' },
      { status: 400 },
    );
  }

  const porBuzon = await rateLimit(`solicitar-demo-buzon:${buzonCanonico(v.solicitud.email)}`, { max: 3, windowSeconds: 86_400 });
  if (!porBuzon.allowed) {
    return NextResponse.json({ error: 'Ya nos has escrito varias veces hoy. Te responderemos en cuanto podamos.' }, { status: 429 });
  }
  const global = await rateLimit('solicitar-demo-global', { max: TOPE_GLOBAL_DIARIO, windowSeconds: 86_400 });
  if (!global.allowed) {
    if (!avisadoTopeGlobal) {
      avisadoTopeGlobal = true;
      Sentry.captureMessage(`[public:solicitar-demo] tope global de ${TOPE_GLOBAL_DIARIO} solicitudes al día alcanzado: posible abuso`, 'warning');
    }
    return NextResponse.json({ error: SIN_SERVICIO }, { status: 503 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) {
    console.error('[public:solicitar-demo] sin RESEND_API_KEY: la solicitud no se puede enviar');
    return NextResponse.json({ error: SIN_SERVICIO }, { status: 503 });
  }
  const { asunto, html } = correoSolicitudDemo(v.solicitud);
  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: remitentePorMarca('Tentare'),
      to: [LEGAL.email],
      replyTo: v.solicitud.email,
      subject: asunto,
      html,
    });
    if (error) {
      console.error('[public:solicitar-demo] Resend rechazó el envío', { name: (error as { name?: string }).name });
      return NextResponse.json({ error: SIN_SERVICIO }, { status: 503 });
    }
  } catch (err) {
    console.error('[public:solicitar-demo] fallo al enviar', { name: (err as { name?: string })?.name });
    return NextResponse.json({ error: SIN_SERVICIO }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
