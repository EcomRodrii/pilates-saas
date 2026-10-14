// ─────────────────────────────────────────────────────────────────────────────
// La venta de una clase suelta en el mostrador (ver lib/reservas/clase-suelta.ts):
// la suscripción PUNTUAL de una sesión que gasta la reserva, y su recibo
// PENDIENTE, los dos con el id de la reserva. La reserva la consume dentro del
// candado de `reservar_plaza` (D-1), y el cobro sigue por su dueño de siempre
// (`marcar-cobrado` → `confirmarCobro`): aquí no se cobra nada.
//
// Va por el servidor (service-role) y no por `entregarPlanComprado`, que es el
// dueño de la compra por Stripe (ids de `cs_`/`pi_`, recibo que nace cobrado).
// La forma de la suscripción sí es la misma que la del TPV
// (`filaSuscripcionDeLinea`).
//
// Sin `@/`: lo prueba `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { filaSuscripcionDeLinea } from '../pos/suscripcion-de-linea.ts';
import { decidirReciboPrevioDeCita, idReciboDeClaseSuelta } from '../cobros/recibo-de-cita.ts';
import { idSuscripcionDeClaseSuelta, type DesenlaceAnulacion } from '../reservas/clase-suelta.ts';

const YA_EXISTIA = '23505';

export interface PlanDeClaseSuelta {
  id: string;
  tipo: string;
  sesiones: number | null;
  validezDias: number | null;
  periodicidadMeses: number | null;
}

/**
 * Lo que deja una venta que no salió, para decírselo bien a recepción:
 *  · `nada`: no quedó nada (o no llegó a guardarse): «no se le ha cobrado nada»;
 *  · `recibo`: la clase suelta se deshizo pero queda su recibo pendiente, que sobra;
 *  · `revisar`: su clase suelta ya se gastó (la reserva sí se hizo), no se pudo
 *    deshacer, o su recibo ya no está pendiente: hay que mirar la clase y su
 *    ficha antes de cobrar o de borrar nada.
 */
export type QuedaTrasVenta = 'nada' | 'recibo' | 'revisar';

export function quedaTrasAnular(anulacion: DesenlaceAnulacion | null): QuedaTrasVenta {
  if (anulacion === 'fallo') return 'recibo';
  if (anulacion === 'servida' || anulacion === 'sin-deshacer') return 'revisar';
  return 'nada';
}

export type ResultadoVentaSuelta =
  | { ok: true; suscripcionId: string; reciboId: string }
  | { ok: false; status: 409 | 500; error: string; queda: QuedaTrasVenta };

/**
 * Deja vendida la clase suelta de esta reserva: la suscripción (1 sesión) y su
 * recibo pendiente. Idempotente: un reintento de la MISMA reserva encuentra las
 * dos filas y sigue con ellas, siempre que sean de la misma clienta y el mismo
 * importe (si no, se manda a revisar: nunca se cobra un recibo que ya no
 * cuadra).
 */
export async function prepararVentaClaseSuelta(admin: SupabaseClient, p: {
  studioId: string;
  socioId: string;
  reservaId: string;
  plan: PlanDeClaseSuelta;
  importe: number;
  concepto: string;
  /** Hoy en el estudio (YYYY-MM-DD). */
  hoy: string;
}): Promise<ResultadoVentaSuelta> {
  const suscripcionId = idSuscripcionDeClaseSuelta(p.reservaId);
  const reciboId = idReciboDeClaseSuelta(p.reservaId);
  if (!suscripcionId || !reciboId) return { ok: false, status: 500, error: 'No se ha podido preparar la clase suelta de esta reserva.', queda: 'nada' };
  const deshacer = async (status: 409 | 500, error: string, soloSuscripcion = false): Promise<ResultadoVentaSuelta> => {
    const r = await anularVentaClaseSuelta(admin, { studioId: p.studioId, suscripcionId, reciboId, ahoraISO: new Date().toISOString(), soloSuscripcion });
    // Sin poder cancelar la suscripción que se acaba de crear, queda una clase
    // que nadie ha pagado: a mirar.
    return { ok: false, status, error, queda: soloSuscripcion ? (r === 'anulada' ? 'nada' : 'revisar') : quedaTrasAnular(r) };
  };

  const fila = filaSuscripcionDeLinea(
    { id: p.plan.id, tipo: p.plan.tipo, sesiones: p.plan.sesiones, validez_dias: p.plan.validezDias, periodicidad_meses: p.plan.periodicidadMeses },
    { suscripcionId, studioId: p.studioId, socioId: p.socioId, hoy: p.hoy },
  );
  const { error: errSus } = await admin.from('suscripciones').insert(fila);
  if (errSus) {
    // Un error que no es «ya existía» puede haber guardado igual (un 504 de la
    // pasarela con el INSERT ya hecho): una clase suelta ACTIVA sin recibo es
    // una clase gratis que nadie ve. Se deshace por si acaso (compare-and-set:
    // si no llegó a guardarse, no toca nada).
    if (errSus.code !== YA_EXISTIA) return deshacer(500, 'No se ha podido apuntar la clase suelta. Inténtalo otra vez.');
    // Reintento: tiene que ser la clase suelta de ESTA clienta.
    const { data: previa } = await admin.from('suscripciones').select('socio_id, plan_id')
      .eq('id', suscripcionId).eq('studio_id', p.studioId).maybeSingle();
    if (!previa || previa.socio_id !== p.socioId) {
      return { ok: false, status: 409, error: 'Esta reserva ya tiene otra clase suelta apuntada. Revísala en la ficha de la clienta.', queda: 'nada' };
    }
  }

  const { error: errRec } = await admin.from('recibos').insert({
    id: reciboId,
    studio_id: p.studioId,
    socio_id: p.socioId,
    suscripcion_id: suscripcionId,
    concepto: p.concepto,
    importe: p.importe,
    estado: 'PENDIENTE',
    fecha_vencimiento: p.hoy,
    es_renovacion: false,
  });
  if (errRec) {
    // Sin recibo, la clase suelta sería una clase gratis que nadie ve: fuera.
    if (errRec.code !== YA_EXISTIA) return deshacer(500, 'No se ha podido apuntar la clase suelta. Inténtalo otra vez.');
    const { data: previo } = await admin.from('recibos')
      .select('estado, importe, socio_id, importe_devuelto, reembolso_stripe_id, reembolso_solicitado_en')
      .eq('id', reciboId).eq('studio_id', p.studioId).maybeSingle();
    const decision = previo
      ? decidirReciboPrevioDeCita({
        estado: previo.estado as string, importe: Number(previo.importe), socioId: (previo.socio_id as string | null) ?? null,
        importeDevuelto: (previo.importe_devuelto as number | null) ?? null,
        reembolsoStripeId: (previo.reembolso_stripe_id as string | null) ?? null,
        reembolsoSolicitadoEn: (previo.reembolso_solicitado_en as string | null) ?? null,
      }, { socioId: p.socioId, importe: p.importe }, 'clase')
      : { tipo: 'revisar' as const, error: 'No se ha podido comprobar el recibo de esta clase. Revísalo en «Quién me debe».' };
    if (decision.tipo === 'revisar') {
      // La suscripción que ESTA llamada acaba de crear sobra (si no, sería una
      // clase gratis). El recibo que ya había no es suyo: se manda a revisar.
      if (!errSus) return deshacer(409, decision.error, true);
      return { ok: false, status: 409, error: decision.error, queda: 'nada' };
    }
  }
  return { ok: true, suscripcionId, reciboId };
}

/**
 * Deshace una venta que no llegó a ser: la plaza no salió (lista de espera, ya
 * apuntada, error), o la reserva gastó otro bono. Dos compare-and-set, en este
 * orden:
 *  1. la suscripción, solo si sigue ACTIVA y con su sesión sin gastar;
 *  2. el recibo, solo si sigue pendiente y sin cobrar.
 * Si la sesión ya se gastó (otra pestaña, una carrera), no se toca nada: esa
 * venta sí sirvió y su recibo se queda (`servida`).
 *
 * Idempotente: si un intento anterior canceló la suscripción y no llegó a anular
 * el recibo, este lo termina. El recibo se reintenta una vez; si aun así no se
 * puede, se avisa (`fallo`): un recibo pendiente sin plaza es un cobro sin
 * clase si alguien lo cobra. Si lo que no se puede deshacer es la propia clase
 * suelta, o el recibo ya no está pendiente, es `sin-deshacer`: se mira antes de
 * tocar nada (borrar solo el recibo la dejaría gratis).
 */
export async function anularVentaClaseSuelta(admin: SupabaseClient, p: {
  studioId: string; suscripcionId: string; reciboId: string; ahoraISO: string;
  /** Solo la suscripción: el recibo que hay con ese id no es de esta venta. */
  soloSuscripcion?: boolean;
}, informar: (mensaje: string, extra: Record<string, unknown>) => void = avisarFallo): Promise<DesenlaceAnulacion> {
  const { data: sus, error: errSus } = await admin.from('suscripciones')
    .update({ estado: 'CANCELADA', sesiones_restantes: 0 })
    .eq('id', p.suscripcionId).eq('studio_id', p.studioId)
    .eq('estado', 'ACTIVA').eq('sesiones_restantes', 1)
    .select('id');
  if (errSus) {
    informar('no se ha podido cancelar la clase suelta que sobraba', { suscripcionId: p.suscripcionId, error: errSus.message });
    return 'sin-deshacer';
  }
  if (!sus || sus.length === 0) {
    // No estaba ACTIVA con su sesión: o ya se canceló (o nunca llegó a
    // guardarse), y entonces se termina con el recibo; o se gastó, y entonces
    // la venta sirvió.
    const { data: ahora, error: errLeer } = await admin.from('suscripciones').select('estado, sesiones_restantes')
      .eq('id', p.suscripcionId).eq('studio_id', p.studioId).maybeSingle();
    if (errLeer) {
      informar('no se ha podido comprobar la clase suelta que sobraba', { suscripcionId: p.suscripcionId, error: errLeer.message });
      return 'sin-deshacer';
    }
    if (ahora && ahora.estado !== 'CANCELADA') return 'servida';
  }
  if (p.soloSuscripcion) return 'anulada';
  for (let intento = 0; intento < 2; intento++) {
    // Sin ningún cobro en marcha: si alguien empezó a pagarlo entretanto, no se
    // anula (y se avisa, abajo), mismo criterio que la política al cancelar una cuota.
    const { error } = await admin.from('recibos')
      .update({ estado: 'ANULADO', anulado_en: p.ahoraISO, proximo_reintento: null })
      .eq('id', p.reciboId).eq('studio_id', p.studioId)
      .eq('estado', 'PENDIENTE').is('fecha_cobro', null)
      .is('stripe_payment_intent_id', null).is('checkout_session_id', null).is('cobro_mostrador_pi', null)
      .is('cobro_off_session_clave', null);
    if (!error) {
      // Nada pendiente que anular: o ya lo estaba, o no llegó a crearse, o
      // alguien lo cobró entretanto (eso hay que mirarlo).
      const { data: rec, error: errRec } = await admin.from('recibos').select('estado').eq('id', p.reciboId).eq('studio_id', p.studioId).maybeSingle();
      if (errRec) {
        informar('no se ha podido comprobar el recibo de una clase suelta que sobraba', { reciboId: p.reciboId, error: errRec.message });
        return 'sin-deshacer';
      }
      if (!rec || rec.estado === 'ANULADO') return 'anulada';
      informar('el recibo de una clase suelta que sobraba no está pendiente o tiene un cobro en marcha', { reciboId: p.reciboId, estado: rec.estado });
      return 'sin-deshacer';
    }
    if (intento === 1) {
      informar('no se ha podido anular el recibo de una clase suelta que sobraba', { reciboId: p.reciboId, error: error.message });
    }
  }
  return 'fallo';
}

export type DesenlaceAnularPorCuota = 'anulada' | 'no-pendiente' | 'fallo' | 'incompleta';

/**
 * La clase suelta de una reserva que ya cubre su cuota, en tres pasos y en este
 * orden, cada uno un compare-and-set:
 *  1. el recibo → ANULADO, solo si sigue PENDIENTE y sin ningún cobro en marcha
 *     (lo que se le cobraría, lo primero);
 *  2. la clase suelta → CANCELADA, aunque esté gastada: activa, una cancelación a
 *     tiempo le devolvería la sesión y tendría una clase gratis;
 *  3. la reserva deja de colgar de la clase suelta (`bono_suscripcion_id`), solo
 *     si sigue apuntando a ella: queda como cualquier reserva con cuota, y al
 *     cancelarla nadie le dice «sesión devuelta a tu bono».
 * Lo decide el estudio desde la ficha; quien llama ya ha comprobado, con lo que
 * leyó él, que la cuota cubre esa clase (`puedeAnularSueltaPorCuota`).
 *
 * Idempotente: con el recibo ya ANULADO (un intento que se quedó a medias) se
 * saltan los cobros y se terminan los otros dos pasos. Si uno de ellos falla, es
 * `incompleta` y se avisa: no se le cobra de más, y repetirlo lo termina.
 */
export async function anularClaseSueltaCubiertaPorCuota(admin: SupabaseClient, p: {
  studioId: string; reciboId: string; suscripcionId: string; reservaId: string; ahoraISO: string;
}, informar: (mensaje: string, extra: Record<string, unknown>) => void = avisarFallo): Promise<DesenlaceAnularPorCuota> {
  const { data: anulados, error } = await admin.from('recibos')
    .update({ estado: 'ANULADO', anulado_en: p.ahoraISO, proximo_reintento: null })
    .eq('id', p.reciboId).eq('studio_id', p.studioId)
    .eq('estado', 'PENDIENTE').is('fecha_cobro', null)
    .is('stripe_payment_intent_id', null).is('checkout_session_id', null).is('cobro_mostrador_pi', null)
    .is('cobro_off_session_clave', null)
    .select('id');
  if (error) {
    informar('no se ha podido anular la clase suelta que cubre la cuota', { reciboId: p.reciboId, error: error.message });
    return 'fallo';
  }
  if (!anulados || anulados.length === 0) {
    // Nada pendiente que anular: o ya estaba anulado (un intento anterior), o alguien lo cobró o empezó a cobrarlo.
    const { data: rec, error: errRec } = await admin.from('recibos').select('estado')
      .eq('id', p.reciboId).eq('studio_id', p.studioId).maybeSingle();
    if (errRec) {
      informar('no se ha podido comprobar el recibo de la clase suelta que cubre la cuota', { reciboId: p.reciboId, error: errRec.message });
      return 'fallo';
    }
    if (rec?.estado !== 'ANULADO') return 'no-pendiente';
  }
  let completa = true;
  const { error: errSus } = await admin.from('suscripciones')
    .update({ estado: 'CANCELADA' })
    .eq('id', p.suscripcionId).eq('studio_id', p.studioId).eq('estado', 'ACTIVA')
    .select('id');
  if (errSus) {
    completa = false;
    informar('recibo de clase suelta anulado, pero la clase suelta sigue activa', { suscripcionId: p.suscripcionId, error: errSus.message });
  }
  const { error: errRes } = await admin.from('reservas')
    .update({ bono_suscripcion_id: null })
    .eq('id', p.reservaId).eq('studio_id', p.studioId).eq('bono_suscripcion_id', p.suscripcionId)
    .select('id');
  if (errRes) {
    completa = false;
    informar('clase suelta anulada, pero la reserva sigue colgando de ella', { reservaId: p.reservaId, error: errRes.message });
  }
  return completa ? 'anulada' : 'incompleta';
}

/** Log + Sentry (dinámico: este módulo se prueba con `node --test`). */
function avisarFallo(mensaje: string, extra: Record<string, unknown>) {
  console.error(`[clase-suelta] ${mensaje}`, extra);
  void import('@sentry/nextjs')
    .then(S => S.captureMessage(`[clase-suelta] ${mensaje}`, { level: 'error', tags: { area: 'clase-suelta' }, extra }))
    .catch(() => { /* sin Sentry solo se pierde el aviso */ });
}
