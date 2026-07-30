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
