// Webhook de mensajes ENTRANTES de Twilio (WhatsApp/SMS) — instrumentación
// de medición, no el inbox completo. Ver comentario de la migración
// 20260820100831_mensajes_entrantes_medicion.sql para el contexto: hoy no
// hay ningún dato de cuántas socias responden a un mensaje de Tentare, así
// que antes de construir una bandeja de entrada de verdad se mide el
// volumen real durante unas semanas con esta única tabla, sin UI.
//
// Configurar en la consola de Twilio (una sola cuenta de plataforma) como
// "A message comes in" en Messaging → WhatsApp senders / Phone Numbers:
// https://<dominio>/api/webhooks/twilio-inbound
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { firmaTwilioValida } from '@/lib/twilio-firma';
import { uid } from '@/lib/utils';
import * as Sentry from '@sentry/nextjs';

export async function POST(request: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  // Sin token configurado, no hay forma de validar la firma — nunca aceptar
  // un webhook sin verificar (fail-closed, mismo criterio que
  // verificarCaptcha() con TURNSTILE_SECRET_KEY ausente, pero al revés:
  // aquí SÍ hay dinero/PII potencial en el cuerpo del mensaje).
  if (!authToken) {
    // Auditoría 21-ago: TODOS los caminos de error eran MUDOS, y eso rompe el
    // propósito de la feature. Es una MEDICIÓN cuyo resultado decide si se
    // construye el inbox: si `NEXT_PUBLIC_APP_URL` no coincide EXACTAMENTE con
    // la URL configurada en la consola de Twilio (apex vs www, barra final), la
    // firma nunca valida, la tabla se queda a cero, y "cero filas" es
    // indistinguible de "ninguna socia responde" — el modo de fallo produce
    // justo la respuesta que cierra el proyecto. Hoy en producción hay 0 filas,
    // así que esto no es teórico.
    Sentry.captureMessage('[twilio inbound] TWILIO_AUTH_TOKEN no configurado: la medición no recibe nada', { level: 'warning' });
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const raw = await request.text();
  const params = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>;

  // Twilio firma sobre la URL exacta que llamó, incluida query string si la
  // hubiera (aquí no hay). request.url puede venir con el host interno tras
  // un proxy; NEXT_PUBLIC_APP_URL es el origen público real, mismo patrón ya
  // usado para construir URLs firmadas en el resto del repo.
  // El fallback a `new URL(request.url).origin` se ha quitado: esa URL sale del
  // Host/X-Forwarded-Host de la petición, o sea del cliente. No era un bypass
  // (forjar la firma sigue exigiendo el auth token) pero es superficie inútil, y
  // además enmascaraba el desajuste de configuración detrás de un 403 mudo.
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) {
    Sentry.captureMessage('[twilio inbound] NEXT_PUBLIC_APP_URL no configurado: no se puede validar la firma', { level: 'warning' });
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const url = `${base}/api/webhooks/twilio-inbound`;
  const firma = request.headers.get('X-Twilio-Signature');

  if (!firmaTwilioValida(authToken, url, params, firma)) {
    // La causa abrumadoramente más probable NO es un atacante, es un desajuste
    // de URL entre esta constante y la consola de Twilio. Se registra la URL
    // usada (no es secreta) para poder compararla de un vistazo. Nunca se
    // registran `params`: llevan el cuerpo del mensaje y el teléfono.
    Sentry.captureMessage('[twilio inbound] firma no válida', {
      level: 'warning',
      extra: { urlUsadaParaLaFirma: url, traeFirma: !!firma },
    });
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const sid = params.MessageSid ?? params.SmsSid;
  const de = params.From;
  const para = params.To;
  if (!sid || !de || !para) return NextResponse.json({ ok: false }, { status: 400 });

  // tentare-seguridad: la ÚNICA función de este endpoint es medir. A
  // diferencia de un envío saliente que puede degradar en silencio, aquí
  // "no insertar" es "perder el dato durante las 2-3 semanas de medición"
  // — falla ruidoso (503) en vez de responder 200 sin haber guardado nada,
  // mismo criterio que ya usa /api/billing/webhook.
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false }, { status: 503 });

  // twilio_sid es UNIQUE: un reintento de Twilio del mismo mensaje no
  // duplica la fila. Se ignora el conflicto en vez de tratarlo como error
  // — es el comportamiento idempotente esperado, no un fallo.
  const { error } = await admin.from('mensajes_entrantes_medicion').insert({
    id: `msg-in-${uid()}`,
    canal: de.startsWith('whatsapp:') ? 'WHATSAPP' : 'SMS',
    de_numero: de,
    para_numero: para,
    cuerpo: params.Body ?? null,
    twilio_sid: sid,
  });
  if (error && error.code !== '23505') {
    // 23505 = unique_violation (reintento de Twilio) — no es un fallo real.
    Sentry.captureMessage('[twilio inbound] no se pudo guardar el mensaje entrante', {
      level: 'warning',
      extra: { codigo: error.code, detalle: String(error.message) },
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  // TwiML vacío: no se responde nada automático — es solo medición.
  return new NextResponse('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } });
}
