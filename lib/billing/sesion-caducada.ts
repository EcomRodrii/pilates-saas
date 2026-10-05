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
//     de siempre: se suelta la sesión. Una cuota nunca se cobra sola antes de su
//     vencimiento: el cron solo la adopta ya vencida (lib/billing/renovacion-adoptable.ts),
//     así que soltar la renovación que ella pidió antes de tiempo no la adelanta;
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
  /** El id dice quién creó la renovación: `rec-renov-…` lo crean «Renovar mi plan» (la alumna) y el cron. */
  reciboId: string;
  /** Hay un reintento del cobro diario programado: es deuda en marcha. */
  proximoReintento: string | null;
  esRenovacion: boolean | null;
  /** `tipoDePlanDelReciboEstricto`: 'MENSUAL' | 'BONO' | 'PUNTUAL' | 'SIN_PLAN' | null (el plan no dice su tipo). */
  tipoPlan: string | null;
}

/**
 * ¿La pidió la alumna? Las renovaciones con id `rec-renov-…` las crean solo
 * «Renovar mi plan» (/api/public/renovar-plan) y el cron, y el cron solo las de
 * cuota (MENSUAL). Las del panel llevan `rec-<uid>`: esas las decidió el estudio.
 */
export const renovacionPedidaPorLaAlumna = (reciboId: string) => reciboId.startsWith('rec-renov-');

export function queHacerConSesionCaducada(r: ReciboConSesionCaducada): DestinoSesionCaducada {
  // Un reintento ya armado es una deuda que el cobro diario tiene que poder seguir cobrando.
  if (r.proximoReintento) return 'soltar';
  if (r.esRenovacion && renovacionPedidaPorLaAlumna(r.reciboId)) {
    // La de una cuota vuelve a su cobro, que nunca la adelanta: el cron solo la
    // adopta ya vencida (lib/billing/renovacion-adoptable.ts).
    if (r.tipoPlan === 'MENSUAL' || r.tipoPlan === 'SIN_PLAN') return 'soltar';
    // La de un bono o una clase suelta que ELLA pidió es una compra nueva, no una
    // deuda: no se cobra sola. Y si el plan no dice su tipo, tampoco: soltarla
    // podría acabar en un cobro que nadie pidió.
    return 'mantener';
  }
  // Una renovación que creó el estudio (o un recibo que no es renovación): es una
  // deuda que decidió él, y vuelve a su cobro.
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

/** Lee el tipo de plan del recibo; LANZA si la base de datos falla (no es «plan desconocido»). */
export type TipoDePlanDelRecibo = (recibo: { entrega_tipo: string | null; suscripcion_id: string | null }) => Promise<string | null>;

/**
 * Qué hacer con la sesión caducada que el recibo tiene guardada, sin tocar nada
 * (solo lee la base de datos). `no-aplica` si el recibo ya no apunta a esa sesión.
 * Un error al leer el plan es `error` (se reintenta en la siguiente pasada), nunca
 * un «plan desconocido».
 */
export async function decidirSesionCaducada(
  admin: SupabaseClient,
  p: { studioId: string; reciboId: string; sesionId: string },
  tipoDePlan: TipoDePlanDelRecibo,
): Promise<DestinoSesionCaducada | 'no-aplica' | 'error'> {
  const { data: recibo, error } = await admin.from('recibos')
    .select('proximo_reintento, es_renovacion, entrega_tipo, suscripcion_id')
    .eq('id', p.reciboId).eq('studio_id', p.studioId).eq('checkout_session_id', p.sesionId)
    .maybeSingle();
  if (error) return 'error';
  if (!recibo) return 'no-aplica';
  const r = recibo as { proximo_reintento: string | null; es_renovacion: boolean | null; entrega_tipo: string | null; suscripcion_id: string | null };
  // El plan solo hace falta para la renovación que pidió la alumna sin reintento:
  // es lo único que puede mantenerse.
  let tipoPlan: string | null = null;
  if (r.es_renovacion && !r.proximo_reintento && renovacionPedidaPorLaAlumna(p.reciboId)) {
    try {
      tipoPlan = await tipoDePlan({ entrega_tipo: r.entrega_tipo, suscripcion_id: r.suscripcion_id });
    } catch {
      return 'error';
    }
  }
  return queHacerConSesionCaducada({ reciboId: p.reciboId, proximoReintento: r.proximo_reintento, esRenovacion: r.es_renovacion, tipoPlan });
}

/** Suelta la sesión con compare-and-set: solo si el recibo sigue apuntando a ESA. */
export async function soltarSesionCaducada(
  admin: SupabaseClient,
  p: { studioId: string; reciboId: string; sesionId: string },
): Promise<'soltada' | 'no-aplica' | 'error'> {
  const { data: soltadas, error } = await admin.from('recibos')
    .update({ checkout_session_id: null })
    .eq('id', p.reciboId).eq('studio_id', p.studioId)
    // Compare-and-set: solo si sigue siendo ESTA sesión (no otra abierta después).
    .eq('checkout_session_id', p.sesionId)
    .select('id');
  if (error) return 'error';
  return (soltadas?.length ?? 0) > 0 ? 'soltada' : 'no-aplica';
}

/**
 * Suelta (o mantiene) la sesión caducada de un recibo, cuando ya se sabe que la
 * sesión CADUCÓ (listado de Stripe, o `checkout.session.expired`).
 *
 * @param tipoDePlan `tipoDePlanDelReciboEstricto`, inyectado (los tests no tienen base de datos).
 */
export async function resolverSesionCaducada(
  admin: SupabaseClient,
  p: { studioId: string; reciboId: string; sesionId: string },
  tipoDePlan: TipoDePlanDelRecibo,
): Promise<ResultadoSesionCaducada> {
  const destino = await decidirSesionCaducada(admin, p, tipoDePlan);
  if (destino === 'error' || destino === 'no-aplica') return destino;
  if (destino === 'mantener') return 'mantenida';
  return soltarSesionCaducada(admin, p);
}

// ─────────────────────────────────────────────────────────────────────────────
// Desde la BASE DE DATOS, no desde el listado de Stripe (5-oct-2026). El listado
// solo ve las sesiones creadas en su ventana (12 h el barrido horario, 72 h la
// vigilancia diaria): una cuota cuya sesión caducó antes —o cuyas dos pasadas de
// vigilancia fallaron— se quedaba congelada para siempre. La vigilancia diaria
// mira además los recibos que siguen apuntando a una sesión, pregunta a Stripe
// por cada una (con un tope por pasada) y resuelve las caducadas igual.
// ─────────────────────────────────────────────────────────────────────────────

/** Llamadas a Stripe por estudio y pasada: las que se mantienen no gastan ninguna. */
export const TOPE_SESIONES_DESDE_LA_BASE = 25;

export type EstadoSesionGuardada = 'caducada' | 'viva' | 'pagada' | 'no-se-sabe';

/** Lo que dice Stripe de una sesión guardada. Una que ya no existe en esa cuenta no la puede pagar nadie. */
export function estadoDeSesionGuardada(sesion: { status: string | null } | null, error: unknown): EstadoSesionGuardada {
  if (error) {
    const e = error as { code?: string; statusCode?: number } | null;
    return e?.code === 'resource_missing' || e?.statusCode === 404 ? 'caducada' : 'no-se-sabe';
  }
  if (sesion?.status === 'expired') return 'caducada';
  if (sesion?.status === 'open') return 'viva';
  if (sesion?.status === 'complete') return 'pagada';
  return 'no-se-sabe';
}
