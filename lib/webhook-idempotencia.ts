// M10 · Idempotencia de webhooks por event.id (tabla webhook_events, migr. 0032).
// Stripe puede re-entregar el mismo evento; esto evita reprocesar uno que YA se
// completó con éxito. Se marca DESPUÉS de procesar OK (nunca antes), así un fallo
// (5xx) deja el evento sin marcar y el reintento de Stripe lo reprocesa.
//
// FAIL-OPEN en la lectura: ante un error consultando, devolvemos "no procesado"
// (procesar). Los handlers son idempotentes a nivel de operación, así que
// reprocesar es seguro; SALTARSE un pago no lo sería.

import type { SupabaseClient } from '@supabase/supabase-js';

export async function webhookYaProcesado(admin: SupabaseClient, eventId: string): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from('webhook_events').select('id').eq('id', eventId).maybeSingle();
    if (error) return false;
    return !!data;
  } catch {
    return false;
  }
}

// Marca el evento como procesado con éxito. Best-effort: si falla, NO rompemos el
// 200 (peor caso, un reintento reprocesa idempotentemente). `on conflict` implícito
// por la PK: si ya existía, el insert choca y lo ignoramos.
export async function marcarWebhookProcesado(admin: SupabaseClient, eventId: string, tipo: string): Promise<void> {
  try {
    await admin.from('webhook_events').insert({ id: eventId, tipo });
  } catch {
    /* no-op */
  }
}
