// Webhook entrante de Meta WhatsApp Business Platform (Fase E, ver
// WHATSAPP_AUDIT.md / META_SETUP.md §6). No es un inbox: procesa
// actualizaciones de ESTADO de los mensajes salientes que ya manda el cron de
// recordatorios (sent/delivered/read/failed → lib/integraciones/salud.ts,
// mismo indicador que ya pinta la tarjeta de Integraciones). Los mensajes
// ENTRANTES se reconocen (200, para que Meta no reintente) pero no se
// procesan más allá — construir un inbox de verdad es una funcionalidad
// aparte, no pedida aquí, y mismo criterio que ya usa
// app/api/webhooks/twilio-inbound (medición, no bandeja).
//
// Configurar en el App Dashboard de Meta → WhatsApp → Configuración →
// Webhooks: https://<dominio>/api/webhooks/whatsapp
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { firmaMetaValida } from '@/lib/meta-firma';
import { reclamarWebhookEvent, marcarWebhookProcesado, claveWebhook } from '@/lib/webhook-idempotencia';
import { registrarSaludIntegracion } from '@/lib/integraciones/registrar-salud';
import * as Sentry from '@sentry/nextjs';

interface CambioWhatsapp {
  field?: string;
  value?: {
    metadata?: { phone_number_id?: string };
    statuses?: { id?: string; status?: string; timestamp?: string }[];
    messages?: { id?: string }[];
  };
}

// Verificación inicial: Meta hace un GET con estos tres parámetros al dar de
// alta la URL en el dashboard, y espera EXACTAMENTE el valor de
// `hub.challenge` de vuelta si el token coincide.
export async function GET(req: NextRequest) {
  const modo = req.nextUrl.searchParams.get('hub.mode');
  const token = req.nextUrl.searchParams.get('hub.verify_token');
  const challenge = req.nextUrl.searchParams.get('hub.challenge');
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (modo === 'subscribe' && verifyToken && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: 'Verificación de webhook fallida' }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const appSecret = process.env.META_APP_SECRET;
  // Sin App Secret no hay forma de validar la firma — nunca aceptar un
  // webhook sin verificar (fail-closed, mismo criterio que
  // app/api/webhooks/twilio-inbound). 503 y no 403: es un fallo de
  // configuración nuestro que se arregla desplegando, y Meta reintenta en
  // 5xx — interesa que lo vuelva a intentar cuando esté puesto.
  if (!appSecret) {
    Sentry.captureMessage('[whatsapp webhook] META_APP_SECRET no configurado', { level: 'warning' });
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  // La firma se calcula sobre el CUERPO CRUDO — hay que leerlo como texto
  // antes de parsear JSON, o el hash no coincide nunca.
  const raw = await req.text();
  const firma = req.headers.get('x-hub-signature-256');
  if (!firmaMetaValida(appSecret, raw, firma)) {
    Sentry.captureMessage('[whatsapp webhook] firma no válida', { level: 'warning', extra: { traeFirma: !!firma } });
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const payload = JSON.parse(raw) as { object?: string; entry?: { id?: string; changes?: CambioWhatsapp[] }[] };
  // Meta manda notificaciones de otros productos (Instagram, Messenger...) al
  // mismo endpoint si la app está suscrita a varios — lo que no es de
  // WhatsApp se reconoce sin procesar.
  if (payload.object !== 'whatsapp_business_account') {
    return NextResponse.json({ ok: true });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    Sentry.captureMessage('[whatsapp webhook] service role no configurada', { level: 'warning' });
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  for (const entry of payload.entry ?? []) {
    for (const cambio of entry.changes ?? []) {
      const value = cambio.value ?? {};
      const phoneNumberId = value.metadata?.phone_number_id;
      // Sin phone_number_id no hay forma segura de resolver a qué estudio
      // pertenece este evento — se descarta en vez de adivinar.
      if (!phoneNumberId) continue;

      // `studio_id` SIEMPRE resuelto contra la columna phone_number_id (Fase
      // D), nunca contra nada que traiga el payload aparte de este ID —
      // mismo principio de no confiar en datos externos sin cruzar contra lo
      // que Tentare ya tiene guardado.
      const { data: fila } = await admin
        .from('integraciones')
        .select('studio_id')
        .eq('tipo', 'WHATSAPP')
        .eq('phone_number_id', phoneNumberId)
        .maybeSingle();
      // Número que no reconocemos (desconectado, o de otra plataforma que
      // comparte el mismo App): se ignora, no es un error.
      if (!fila) continue;

      for (const status of value.statuses ?? []) {
        if (!status.id || !status.status) continue;
        // Idempotencia compartida con el resto del repo (0032/M10): un mismo
        // wamid pasa por varios estados (sent→delivered→read), así que la
        // clave incluye el estado, no solo el id del mensaje.
        const clave = claveWebhook('whatsapp', `${status.id}:${status.status}`);
        const reclamado = await reclamarWebhookEvent(admin, clave, `whatsapp_status_${status.status}`);
        if (!reclamado) continue;

        // `failed` es la única señal que de verdad importa para la salud: es
        // exactamente el caso que la tarjeta de Integraciones existe para
        // enseñar (token revocado, plantilla rechazada, número inválido) sin
        // esperar al próximo recordatorio fallido del cron.
        if (status.status === 'failed') {
          await registrarSaludIntegracion(admin, fila.studio_id as string, 'WHATSAPP', {
            ok: false,
            error: `Meta marcó un mensaje como no entregado (${status.id})`,
          });
        } else {
          await registrarSaludIntegracion(admin, fila.studio_id as string, 'WHATSAPP', { ok: true });
        }
        await marcarWebhookProcesado(admin, clave);
      }

      // Mensajes entrantes: reconocidos, no procesados (ver cabecera). No
      // hace falta idempotencia aquí porque no se escribe nada.
    }
  }

  return NextResponse.json({ ok: true });
}
