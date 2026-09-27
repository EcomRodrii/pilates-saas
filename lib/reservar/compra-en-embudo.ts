// Una compra pagada, en el embudo del widget (`widget_eventos`), anotada por el
// SERVIDOR al entregarla (lib/billing/entregar-plan-comprado.ts).
//
// Antes la anotaba el navegador, y solo en el pago embebido: quien pagaba por
// Stripe Checkout volvía a `?compra=ok` y no se anotaba nada. Además, si el pago
// empezó dentro del iframe de la web del estudio, la vuelta cae en la página
// principal, con otro `sessionStorage` y sin el `?ref=`, así que ni anotándolo
// al volver casaría con su `checkout_started`. Resultado: el embudo por widget
// daba 0 compras y el Decision OS (C3, abandono de checkout) veía el 100 % de
// las compras online como abandonadas.
//
// Ahora el navegador manda su sesión al crear el pago, viaja en la metadata de
// Stripe y se anota aquí una sola vez por pago: el id es determinista, así que
// un webhook reintentado o el conciliador llegando detrás no la duplican.
// Nunca lanza: la analítica no puede tumbar una entrega con el dinero cobrado.

import type { SupabaseClient } from '@supabase/supabase-js';

/** La sesión del widget: `crypto.randomUUID()` (lib/reservar/eventos.ts). */
const SESION_VALIDA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Mismo formato que la etiqueta `?ref=` del widget (lib/widgets/config.ts). */
const ORIGEN_VALIDO = /^[A-Za-z0-9_-]{1,40}$/;

/** Lo que viaja en la metadata del pago; cualquier otra cosa se descarta. */
export function sesionWidgetValida(v: unknown): string | null {
  return typeof v === 'string' && SESION_VALIDA.test(v) ? v : null;
}

export function idEventoCompra(idPago: string): string {
  return `evt-compra-${idPago}`;
}

export async function registrarCompraEnEmbudo(admin: SupabaseClient, p: {
  studioId: string;
  /** `cs_…` o `pi_…`: el origen del cobro, base del id. */
  idPago: string;
  widgetSesion: string | null | undefined;
  origen: string | null | undefined;
  sesionClaseId?: string | null;
  socioId?: string | null;
}): Promise<void> {
  const sesion = sesionWidgetValida(p.widgetSesion);
  // Sin sesión del widget no es una compra del widget (la app de la alumna,
  // una compra anterior a esto): no se inventa ninguna.
  if (!sesion) return;
  try {
    const { error } = await admin.from('widget_eventos').upsert({
      id: idEventoCompra(p.idPago),
      studio_id: p.studioId,
      session_id: sesion,
      tipo: 'booking_completed',
      sesion_clase_id: p.sesionClaseId ?? null,
      origen: p.origen && ORIGEN_VALIDO.test(p.origen) ? p.origen : null,
      socio_id: p.socioId ?? null,
    }, { onConflict: 'id', ignoreDuplicates: true });
    // FK inválida (la clase se borró entre medias): no es una avería.
    if (error && error.code !== '23503') {
      console.error('[registrarCompraEnEmbudo] no se ha anotado la compra en el embudo:', error.message);
    }
  } catch (e) {
    console.error('[registrarCompraEnEmbudo] no se ha anotado la compra en el embudo:', e instanceof Error ? e.message : e);
  }
}
