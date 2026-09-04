// M10 · Idempotencia de webhooks por event.id (tabla webhook_events, migr. 0032;
// reclamación atómica añadida en 20260730109000).
//
// reclamarWebhookEvent hace el check-y-marca en UNA sola sentencia SQL (RPC
// reclamar_webhook_event, UPSERT condicional) — cierra la carrera que tenía el
// patrón anterior SELECT-then-INSERT, donde dos entregas concurrentes del
// mismo event.id podían pasar ambas el SELECT en "no procesado" antes de que
// ninguna hubiera insertado.
//
// No hay liberación explícita de la reclamación en los ~15 puntos de retorno
// de fallo de los webhooks, A PROPÓSITO: la reclamación EXPIRA sola pasados
// expiraSegundos si nadie llama a marcarWebhookProcesado. Un fallo real (5xx,
// timeout de función) deja el evento reclamable de nuevo mucho antes del
// siguiente reintento de Stripe — nunca queda enmascarado como "procesado"
// para siempre. Ver comentario largo en la migración 20260730109000.
//
// FAIL-OPEN ante un error de RPC: devolvemos "reclamado" (procesar). Los
// handlers son idempotentes a nivel de operación, así que reprocesar es
// seguro; SALTARSE un pago no lo sería.

import type { SupabaseClient } from '@supabase/supabase-js';

// Los DOS webhooks de Stripe de este repo —/api/stripe/webhook (pagos de
// socias) y /api/billing/webhook (suscripción del estudio al SaaS)— comparten
// esta tabla, pero hacen trabajos DISTINTOS sobre el mismo `event.id`: Stripe
// entrega un `checkout.session.completed` a todos los destinos suscritos a ese
// tipo, no solo al que le toca. Sin separar el ámbito, el primero en llegar
// reclamaba el evento y el segundo se saltaba SU parte creyendo que ya estaba
// hecha.
//
// Así se perdió un cobro real (8-ago-2026, 1 €): el destino del SaaS recibió el
// checkout de un bono, no era suyo, respondió 200 y dejó el evento marcado como
// completado. El webhook que entrega el bono nunca lo procesó y la socia pagó
// sin recibir nada. Prefijar por ámbito hace que cada uno lleve su propia
// cuenta, y de paso permite reenviar un evento desde Stripe sin que la
// reclamación del otro ámbito lo bloquee.
// 'whatsapp': eventos entrantes de Meta (app/api/webhooks/whatsapp) — ámbito
// propio porque el `id` de un evento de WhatsApp (wamid de un mensaje/status)
// vive en un espacio de nombres totalmente distinto al `event.id` de Stripe;
// prefijar evita cualquier colisión teórica entre los dos.
export type AmbitoWebhook = 'connect' | 'billing' | 'whatsapp';

export function claveWebhook(ambito: AmbitoWebhook, eventId: string): string {
  return `${ambito}:${eventId}`;
}

export async function reclamarWebhookEvent(
  admin: SupabaseClient,
  eventId: string,
  tipo: string,
  expiraSegundos = 120,
): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc('reclamar_webhook_event', {
      p_event_id: eventId,
      p_tipo: tipo,
      p_expira_segundos: expiraSegundos,
    });
    if (error) return true;
    return data === true;
  } catch {
    return true;
  }
}

// Marca la reclamación como completada. Best-effort: si falla, NO rompemos el
// 200 (peor caso, la reclamación expira sola y un reintento reprocesa
// idempotentemente).
export async function marcarWebhookProcesado(admin: SupabaseClient, eventId: string): Promise<void> {
  try {
    await admin.rpc('completar_webhook_event', { p_event_id: eventId });
  } catch {
    /* no-op */
  }
}
