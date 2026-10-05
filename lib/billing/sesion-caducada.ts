import type { SupabaseClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────────────────────
// Una sesión de pago de un recibo (Checkout de Stripe) que CADUCÓ sin pagarse.
//
// `recibos.checkout_session_id` se escribe al abrir el pago (app/api/stripe/checkout)
// y solo lo borra el cobro (`confirmarCobro`). Si la clienta abre el pago y no lo
// termina, la sesión caduca en Stripe (24 h) pero la columna se queda puesta para
// siempre, y con ella el recibo sale de los tres sitios que cobran solos:
//   · el cobro diario con tarjeta guardada (`reservarCobroOffSession`, AUTOMATICO);
//   · la adopción de renovaciones del cron (lib/inngest/renovaciones.ts);
//   · la remesa SEPA («tiene abierto un pago online», remesa-sepa-reglas.ts).
// Es decir: abrir y cerrar el enlace de pago de una CUOTA la congelaba, y nadie se
// enteraba.
//
// Qué se hace con ella (decisión D-3, por defecto, ver `queHacerConSesionCaducada`):
//   · una DEUDA (cuota, o recibo con un reintento ya programado) vuelve a su cobro
//     de siempre: se suelta la sesión;
//   · la renovación de un BONO o una clase suelta que la propia clienta pidió
//     («Renovar mi plan») y no pagó NO se cobra nunca sola: se mantiene, igual que
//     hoy (ver el comentario D-3 de lib/inngest/renovaciones.ts).
//
// Lo aplican el conciliador horario y la vigilancia de 72 h (el endpoint del
// webhook no está suscrito a `checkout.session.expired` en producción) y, si algún
// día se suscribe, la rama `checkout.session.expired` del webhook. Siempre con
// compare-and-set sobre ESA sesión: si entre medias se abrió otra, o se cobró, no
// se toca nada.
//
// Sin alias `@/`: lo carga `node --test` y el conciliador.
// ─────────────────────────────────────────────────────────────────────────────

export type DestinoSesionCaducada = 'soltar' | 'mantener';

export interface ReciboConSesionCaducada {
  /** Hay un reintento del cobro diario programado: es deuda en marcha. */
  proximoReintento: string | null;
  esRenovacion: boolean | null;
  /** `tipoDePlanDelRecibo`: 'MENSUAL' | 'BONO' | 'PUNTUAL' | 'SIN_PLAN' | null (no se ha podido saber). */
  tipoPlan: string | null;
}

export function queHacerConSesionCaducada(r: ReciboConSesionCaducada): DestinoSesionCaducada {
  // Un reintento ya armado es una deuda que el cobro diario tiene que poder seguir cobrando.
  if (r.proximoReintento) return 'soltar';
  if (r.esRenovacion) {
    // La renovación de un bono o de una clase suelta: es una compra nueva que pidió
    // ella, no una deuda. No se cobra sola.
    if (r.tipoPlan === 'BONO' || r.tipoPlan === 'PUNTUAL') return 'mantener';
    // Sin saber de qué plan es, tampoco: soltarla podría acabar en un cobro que
    // nadie pidió. La siguiente pasada lo vuelve a mirar.
    if (r.tipoPlan === null) return 'mantener';
  }
  return 'soltar';
}

/** Lo que hace falta de una Checkout Session listada. */
export interface SesionListada {
  id: string;
  status: string | null;
  metadata?: Record<string, string> | null;
}

/** Las sesiones CADUCADAS de un recibo de este estudio, de un listado de la cuenta. */
export function sesionesCaducadasDeRecibos(
  sesiones: readonly SesionListada[],
  studioId: string,
): Array<{ sesionId: string; reciboId: string }> {
  const out: Array<{ sesionId: string; reciboId: string }> = [];
  for (const s of sesiones) {
    if (s.status !== 'expired') continue;
    const reciboId = s.metadata?.reciboId;
    if (!reciboId) continue;
    // La metadata solo CONFIRMA el estudio; la autoridad es la cuenta listada.
    if (s.metadata?.studioId && s.metadata.studioId !== studioId) continue;
    out.push({ sesionId: s.id, reciboId });
  }
  return out;
}

export type ResultadoSesionCaducada = 'soltada' | 'mantenida' | 'no-aplica' | 'error';

/**
 * Suelta (o mantiene) la sesión caducada de un recibo. Solo actúa si el recibo
 * sigue apuntando a ESA sesión; el UPDATE lo vuelve a exigir.
 *
 * @param tipoDePlan `tipoDePlanDelRecibo`, inyectado (los tests no tienen base de datos).
 */
export async function resolverSesionCaducada(
  admin: SupabaseClient,
  p: { studioId: string; reciboId: string; sesionId: string },
  tipoDePlan: (recibo: { entrega_tipo: string | null; suscripcion_id: string | null }) => Promise<string | null>,
): Promise<ResultadoSesionCaducada> {
  const { data: recibo, error } = await admin.from('recibos')
    .select('proximo_reintento, es_renovacion, entrega_tipo, suscripcion_id')
    .eq('id', p.reciboId).eq('studio_id', p.studioId).eq('checkout_session_id', p.sesionId)
    .maybeSingle();
  if (error) return 'error';
  if (!recibo) return 'no-aplica';
  const r = recibo as { proximo_reintento: string | null; es_renovacion: boolean | null; entrega_tipo: string | null; suscripcion_id: string | null };
  // El plan solo hace falta para la renovación sin reintento: es lo único que puede mantenerse.
  const tipoPlan = r.es_renovacion && !r.proximo_reintento
    ? await tipoDePlan({ entrega_tipo: r.entrega_tipo, suscripcion_id: r.suscripcion_id })
    : null;
  const destino = queHacerConSesionCaducada({ proximoReintento: r.proximo_reintento, esRenovacion: r.es_renovacion, tipoPlan });
  if (destino === 'mantener') return 'mantenida';
  const { data: soltadas, error: errSoltar } = await admin.from('recibos')
    .update({ checkout_session_id: null })
    .eq('id', p.reciboId).eq('studio_id', p.studioId)
    // Compare-and-set: solo si sigue siendo ESTA sesión (no otra abierta después).
    .eq('checkout_session_id', p.sesionId)
    .select('id');
  if (errSoltar) return 'error';
  return (soltadas?.length ?? 0) > 0 ? 'soltada' : 'no-aplica';
}
