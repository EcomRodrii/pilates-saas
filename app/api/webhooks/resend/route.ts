// Webhook entrante de Resend — lo que le pasa a un correo DESPUÉS de mandarlo.
//
// ── Por qué existe ───────────────────────────────────────────────────────────
// `resend.emails.send()` devuelve 200 y un id cuando Resend ACEPTA la petición,
// no cuando entrega el correo. Todo el repo trataba ese 200 como «enviado»: los
// avisos de hueco, los recordatorios, las facturas, los accesos. Lo que ocurre
// después —rebote, queja de spam, supresión— solo llega por aquí, y este
// endpoint no existía: la cuenta tenía 30 direcciones suprimidas y CERO
// webhooks, así que nadie en el producto podía saberlo.
//
// Medido el 11-sep-2026, dos avisos de hueco seguidos desde el panel:
//   · `fashionbeatriz553@email.com` (errata de @gmail.com) → 200 + id → REBOTÓ.
//   · `meri@gmail.com` (ya suprimida por un rebote anterior) → 200 + id →
//     descartado sin intentarlo.
// El panel dijo «1 aviso enviado» las dos veces.
//
// ── Qué hace ─────────────────────────────────────────────────────────────────
// Anota el buzón roto en `email_rebotes` y lo borra cuando vuelve a entregar.
// No decide nada más: quién deja de escribir a esa dirección es cosa de cada
// flujo. Hoy lo consulta el aviso comercial de hueco.
//
// Dar de alta en Resend → Webhooks: https://<dominio>/api/webhooks/resend, con
// los eventos email.bounced / email.complained / email.suppressed /
// email.delivered. El secreto que da Resend va en RESEND_WEBHOOK_SECRET.
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { reclamarWebhookEvent, marcarWebhookProcesado, claveWebhook } from '@/lib/webhook-idempotencia';
import { interpretarEventoResend } from '@/lib/emails/rebotes';
import * as Sentry from '@sentry/nextjs';

export async function POST(req: NextRequest) {
  // Fail-CLOSED: sin secreto no hay forma de saber si esto viene de Resend, y
  // aceptar sin verificar dejaría que cualquiera marcase como rota la dirección
  // de cualquier socia. 503 y no 403 porque es un fallo de configuración
  // NUESTRO que se arregla desplegando, y Resend reintenta ante un 5xx —
  // interesa que lo vuelva a intentar cuando la variable esté puesta.
  const secreto = process.env.RESEND_WEBHOOK_SECRET;
  if (!secreto) {
    Sentry.captureMessage('[resend webhook] RESEND_WEBHOOK_SECRET no configurado', { level: 'warning' });
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  // La firma va sobre el cuerpo CRUDO: parsear antes rompe el hash siempre.
  const raw = await req.text();
  const id = req.headers.get('svix-id') ?? req.headers.get('webhook-id');
  const timestamp = req.headers.get('svix-timestamp') ?? req.headers.get('webhook-timestamp');
  const signature = req.headers.get('svix-signature') ?? req.headers.get('webhook-signature');
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  let evento: unknown;
  try {
    // Verifica firma y ventana temporal, y lanza si no cuadra. La clave de API
    // no se usa para esto, pero el SDK la exige para construirse.
    evento = new Resend(process.env.RESEND_API_KEY ?? 're_XXXX')
      .webhooks.verify({ payload: raw, headers: { id, timestamp, signature }, webhookSecret: secreto });
  } catch {
    Sentry.captureMessage('[resend webhook] firma no válida', { level: 'warning' });
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const efecto = interpretarEventoResend(evento);
  if (efecto.accion === 'ignorar') return NextResponse.json({ ok: true });

  const admin = getSupabaseAdmin();
  if (!admin) {
    Sentry.captureMessage('[resend webhook] service role no configurada', { level: 'warning' });
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  // Idempotencia compartida (tabla webhook_events, 0032/M10) con su propio
  // ámbito: el `svix-id` de Resend vive en un espacio de nombres distinto al
  // `event.id` de Stripe y al wamid de WhatsApp.
  const clave = claveWebhook('resend', id);
  const tipo = (evento as { type?: string })?.type ?? 'resend';
  if (!(await reclamarWebhookEvent(admin, clave, tipo))) return NextResponse.json({ ok: true });

  try {
    if (efecto.accion === 'anotar') {
      // `upsert` y no `insert`: la MISMA dirección puede rebotar muchas veces, y
      // lo que interesa guardar es el último motivo, no el primero.
      await admin.from('email_rebotes').upsert(
        efecto.rebotes.map(r => ({
          email: r.email,
          tipo: r.tipo,
          motivo: r.motivo,
          email_id: r.emailId,
          detectado_en: new Date().toISOString(),
        })),
        { onConflict: 'email' },
      );
    } else {
      // Ha llegado de verdad. Si la dirección estaba marcada, deja de estarlo:
      // sin esto, corregir la errata de un correo no serviría de nada — la
      // dirección buena se quedaría marcada para siempre por el rebote de la
      // mala, y el aviso seguiría sin salir.
      await admin.from('email_rebotes').delete().in('email', efecto.emails);
    }
  } catch (err) {
    // 500 a propósito: Resend reintenta, y perder un rebote en silencio es
    // volver al bug que este endpoint viene a cerrar. La reclamación de
    // idempotencia expira sola, así que el reintento vuelve a procesarlo.
    Sentry.captureException(err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  await marcarWebhookProcesado(admin, clave);
  return NextResponse.json({ ok: true });
}
