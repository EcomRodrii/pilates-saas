// Webhook de mensajes ENTRANTES de Twilio (WhatsApp/SMS) — instrumentación
// de medición, no el inbox completo. Ver comentario de la migración
// 20260820140000_mensajes_entrantes_medicion.sql para el contexto: hoy no
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

export async function POST(request: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  // Sin token configurado, no hay forma de validar la firma — nunca aceptar
  // un webhook sin verificar (fail-closed, mismo criterio que
  // verificarCaptcha() con TURNSTILE_SECRET_KEY ausente, pero al revés:
  // aquí SÍ hay dinero/PII potencial en el cuerpo del mensaje).
  if (!authToken) return NextResponse.json({ ok: false }, { status: 503 });

  const raw = await request.text();
  const params = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>;

  // Twilio firma sobre la URL exacta que llamó, incluida query string si la
  // hubiera (aquí no hay). request.url puede venir con el host interno tras
  // un proxy; NEXT_PUBLIC_APP_URL es el origen público real, mismo patrón ya
  // usado para construir URLs firmadas en el resto del repo.
  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const url = `${base}/api/webhooks/twilio-inbound`;
  const firma = request.headers.get('X-Twilio-Signature');

  if (!firmaTwilioValida(authToken, url, params, firma)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const sid = params.MessageSid ?? params.SmsSid;
  const de = params.From;
  const para = params.To;
  if (!sid || !de || !para) return NextResponse.json({ ok: false }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (admin) {
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
      return NextResponse.json({ ok: false }, { status: 500 });
    }
  }

  // TwiML vacío: no se responde nada automático — es solo medición.
  return new NextResponse('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } });
}
