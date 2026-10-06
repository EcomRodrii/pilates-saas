import 'server-only';
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import {
  decidirPagoDeClase, MENSAJE_PAGO_DE_CLASE_EN_CURSO, MENSAJE_PAGO_PREPARANDOSE, CODIGO_PAGO_A_MEDIAS, MENSAJE_PAGO_DE_CLASE_A_MEDIAS,
  type ContenidoPagoClase, type FilaPagoClase,
} from '@/lib/billing/pago-de-clase';
import { quienPaga } from '@/lib/billing/clave-checkout-embebido';
import { plazaDePICancelado } from '@/lib/billing/cupo-matricula-abandonado';
import { liberarCupoMatriculaUnaVez } from '@/lib/billing/matricula-online';
import { liberarPlazaPorRef } from '@/lib/opening/cupo';
import { CODIGO_PAGO_EN_CURSO } from '@/lib/billing/pago-en-curso';
import { esTablaQueFalta } from '@/lib/db/tabla-que-falta';

// ─────────────────────────────────────────────────────────────────────────────
// El dueño de «el pago abierto de una clase» (P06 · Fase A). La regla está en
// `pago-de-clase.ts`; aquí la base de datos y Stripe.
//
// ⚠️ Si la tabla todavía no existe (código desplegado antes que la migración
// 20261006120000), devuelve `sin-tabla` y la ruta cobra como antes: nunca se
// queda nadie sin poder pagar por el orden de despliegue.
// ─────────────────────────────────────────────────────────────────────────────

const COLUMNAS = 'id, estado, plan_id, codigo_descuento_id, spot_id, importe_centimos, matricula_centimos, cupo_matricula, referencia_stripe, payment_intent_id, creado_en';

export type PreparacionPagoClase =
  | { tipo: 'crear'; fila: FilaPagoClase }
  | { tipo: 'recrear'; fila: FilaPagoClase }
  | { tipo: 'reutilizar'; fila: FilaPagoClase; pi: Stripe.PaymentIntent }
  | { tipo: 'rechazo'; status: 409 | 503; codigo: string; error: string; pi?: string }
  | { tipo: 'sin-tabla' };

function sinTabla(e: { code?: string } | null | undefined): boolean {
  return esTablaQueFalta(e);
}

/**
 * Busca el pago vivo de esta persona en esta clase y decide qué hacer con él.
 * Con `crear` deja ya insertada la fila nueva (ABIERTO, sin cobro): quien llama
 * reserva matrícula y cupo, crea el cobro con `claveDePagoDeClase(fila.id)` y lo
 * ancla con `anclarCobroDePago`.
 */
export async function prepararPagoDeClase(admin: SupabaseClient, stripe: Stripe, stripeAccount: string, p: {
  studioId: string; socioId: string | null; email: string | null; sesionId: string;
  contenido: ContenidoPagoClase; terminosHash: string | null; plazaComprobadaEn: Date;
  ahora?: Date;
}): Promise<PreparacionPagoClase> {
  const pagador = quienPaga(p.socioId, p.email);
  const ahora = p.ahora ?? new Date();

  for (let vuelta = 0; vuelta < 3; vuelta++) {
    const { data: vivas, error: errLeer } = await admin.from('pagos_clase').select(COLUMNAS)
      .eq('studio_id', p.studioId).eq('pagador', pagador).eq('sesion_id', p.sesionId)
      .in('estado', ['ABIERTO', 'PAGADO']).limit(1);
    if (errLeer) {
      if (sinTabla(errLeer)) return { tipo: 'sin-tabla' };
      return { tipo: 'rechazo', status: 503, codigo: 'error', error: 'No hemos podido preparar el pago. Inténtalo en un momento: no te hemos cobrado nada.' };
    }
    const fila = ((vivas ?? [])[0] as FilaPagoClase | undefined) ?? null;

    let estadoStripe: string | null | undefined;
    let pi: Stripe.PaymentIntent | null = null;
    let decision = decidirPagoDeClase(fila, p.contenido, ahora.getTime());
    if (decision === 'mirar-stripe' && fila?.payment_intent_id) {
      try {
        pi = await stripe.paymentIntents.retrieve(fila.payment_intent_id, undefined, { stripeAccount });
        estadoStripe = pi.status;
      } catch {
        estadoStripe = null;
      }
      decision = decidirPagoDeClase(fila, p.contenido, ahora.getTime(), estadoStripe, pi?.created ?? null);
    }

    switch (decision) {
      case 'en-curso':
        return { tipo: 'rechazo', status: 409, codigo: CODIGO_PAGO_EN_CURSO, error: MENSAJE_PAGO_DE_CLASE_EN_CURSO, ...(fila?.payment_intent_id ? { pi: fila.payment_intent_id } : {}) };
      case 'a-medias':
        // Un 3DS a medias NO es «pago hecho»: sin `pi`, la pantalla no se pone a esperar una plaza que nadie ha pagado.
        return { tipo: 'rechazo', status: 409, codigo: CODIGO_PAGO_A_MEDIAS, error: MENSAJE_PAGO_DE_CLASE_A_MEDIAS };
      case 'preparandose':
        return { tipo: 'rechazo', status: 409, codigo: 'pago-preparandose', error: MENSAJE_PAGO_PREPARANDOSE };
      case 'no-se-sabe':
        return { tipo: 'rechazo', status: 503, codigo: 'error', error: 'No hemos podido comprobar el pago que ya tenías abierto. Inténtalo en un momento: no te hemos cobrado nada.' };
      case 'reutilizar':
        if (fila && pi) return { tipo: 'reutilizar', fila, pi };
        return { tipo: 'rechazo', status: 503, codigo: 'error', error: 'No hemos podido preparar el pago. Inténtalo en un momento: no te hemos cobrado nada.' };
      case 'recrear':
        if (fila) return { tipo: 'recrear', fila };
        break;
      case 'cancelar-y-crear': {
        if (!fila) break;
        const cerrado = await cerrarPagoAnterior(admin, stripe, stripeAccount, p.studioId, fila, pi);
        if (cerrado !== 'cerrado') {
          return cerrado === 'pagado'
            ? { tipo: 'rechazo', status: 409, codigo: CODIGO_PAGO_EN_CURSO, error: MENSAJE_PAGO_DE_CLASE_EN_CURSO, ...(fila.payment_intent_id ? { pi: fila.payment_intent_id } : {}) }
            : { tipo: 'rechazo', status: 503, codigo: 'error', error: 'No hemos podido cerrar el pago que ya tenías abierto. Inténtalo en un momento: no te hemos cobrado nada.' };
        }
        // Cerrado: la siguiente vuelta ya no lo ve vivo y crea uno nuevo.
        continue;
      }
      case 'crear':
      default:
        break;
    }

    // Crear: la fila nueva, sin cobro todavía. El índice único hace que dos peticiones a
    // la vez no puedan crear dos: la segunda choca (23505) y vuelve a leer.
    const id = `pc-${globalThis.crypto.randomUUID()}`;
    const { data: creada, error: errCrear } = await admin.from('pagos_clase').insert({
      id, studio_id: p.studioId, pagador, socio_id: p.socioId, sesion_id: p.sesionId,
      plan_id: p.contenido.planId, spot_id: p.contenido.spotId, codigo_descuento_id: p.contenido.codigoDescuentoId,
      importe_centimos: p.contenido.importeCentimos, terminos_hash: p.terminosHash,
      plaza_comprobada_en: p.plazaComprobadaEn.toISOString(), estado: 'ABIERTO',
    }).select(COLUMNAS).single();
    if (!errCrear && creada) return { tipo: 'crear', fila: creada as FilaPagoClase };
    if (sinTabla(errCrear)) return { tipo: 'sin-tabla' };
    if (errCrear?.code !== '23505') {
      return { tipo: 'rechazo', status: 503, codigo: 'error', error: 'No hemos podido preparar el pago. Inténtalo en un momento: no te hemos cobrado nada.' };
    }
    // Otra petición la ha creado a la vez: se vuelve a leer y se decide sobre ella.
  }
  return { tipo: 'rechazo', status: 409, codigo: 'pago-preparandose', error: MENSAJE_PAGO_PREPARANDOSE };
}

/**
 * Cancela el cobro de un pago anterior (otro contenido) y da la fila por CANCELADA.
 * Solo si Stripe confirma `canceled`: un cobro que se acaba de pagar NO se toca.
 * Devuelve lo retenido (plaza de etapa y matrícula gratis) con las mismas claves que
 * el conciliador: una sola vez.
 */
async function cerrarPagoAnterior(
  admin: SupabaseClient, stripe: Stripe, stripeAccount: string, studioId: string,
  fila: FilaPagoClase, conocido: Stripe.PaymentIntent | null,
): Promise<'cerrado' | 'pagado' | 'no-se-sabe'> {
  let cancelado: Stripe.PaymentIntent | null = null;
  if (fila.payment_intent_id) {
    if (conocido?.status === 'canceled') {
      cancelado = conocido;
    } else {
      try {
        cancelado = await stripe.paymentIntents.cancel(fila.payment_intent_id, { cancellation_reason: 'requested_by_customer' }, {
          stripeAccount, idempotencyKey: `pago-clase-cancelar-${fila.payment_intent_id}`,
        });
      } catch {
        try { cancelado = await stripe.paymentIntents.retrieve(fila.payment_intent_id, undefined, { stripeAccount }); } catch { cancelado = null; }
      }
      if (!cancelado) return 'no-se-sabe';
      if (cancelado.status !== 'canceled') {
        return ['succeeded', 'processing', 'requires_action', 'requires_capture'].includes(cancelado.status) ? 'pagado' : 'no-se-sabe';
      }
    }
  }
  const { error } = await admin.rpc('registrar_resultado_pago_clase', {
    p_id: fila.id, p_studio_id: studioId, p_estado: 'CANCELADO',
  });
  if (error) return 'no-se-sabe';
  if (cancelado) {
    await liberarPlazaPorRef(admin, cancelado.id);
    const matricula = plazaDePICancelado(cancelado);
    if (matricula) {
      try {
        await liberarCupoMatriculaUnaVez(admin, matricula.clave, matricula.planId, studioId);
      } catch (e) {
        // Nada anotado: el conciliador la devuelve al ver el PI cancelado con la marca.
        Sentry.captureException(e instanceof Error ? e : new Error('liberar matrícula del pago de clase anterior'), {
          level: 'warning', tags: { modulo: 'pago-de-clase', paso: 'cancelar-anterior' }, extra: { studioId, pagoClaseId: fila.id },
        });
      }
    }
  }
  return 'cerrado';
}

/**
 * Se le vuelve a entregar el mismo cobro (reabrió la hoja): la plaza se acaba de comprobar y el reloj del abandono
 * empieza de nuevo (el barrido cuenta desde `actualizado_en`, no desde que se creó). Best-effort: si falla, como mucho
 * el barrido lo cancela antes de tiempo y el siguiente intento abre otro.
 */
export async function renovarEntregaDePago(admin: SupabaseClient, filaId: string, plazaComprobadaEn: Date): Promise<void> {
  const ahora = new Date().toISOString();
  const { error } = await admin.from('pagos_clase')
    .update({ actualizado_en: ahora, plaza_comprobada_en: plazaComprobadaEn.toISOString() })
    .eq('id', filaId).eq('estado', 'ABIERTO');
  if (error) {
    Sentry.captureException(new Error(`renovar la entrega del pago de clase: ${error.message}`), {
      level: 'warning', tags: { modulo: 'pago-de-clase', paso: 'reutilizar' }, extra: { pagoClaseId: filaId },
    });
  }
}

/** Lo que se reservó al crear la fila: la matrícula de ESTE pago (para no volver a gastarla al recrear). */
export async function anotarMatriculaDePago(admin: SupabaseClient, filaId: string, matriculaCentimos: number, cupo: boolean): Promise<void> {
  const { error } = await admin.from('pagos_clase').update({
    matricula_centimos: matriculaCentimos, cupo_matricula: cupo, actualizado_en: new Date().toISOString(),
  }).eq('id', filaId).eq('estado', 'ABIERTO').is('payment_intent_id', null);
  if (error) {
    Sentry.captureException(new Error(`anotar matrícula del pago de clase: ${error.message}`), {
      level: 'warning', tags: { modulo: 'pago-de-clase', paso: 'matricula' }, extra: { pagoClaseId: filaId },
    });
  }
}

/**
 * Ancla el cobro de Stripe a la fila (compare-and-set): donde no tenía cobro, o tenía
 * ESTE, o el `anterior` (un cobro cancelado que el bucle de la ruta sustituyó por otro
 * con una clave derivada). `false`: la fila ya no es de este cobro (otra pestaña, o la
 * cerró otra petición): quien llama no entrega este client_secret.
 */
export async function anclarCobroDePago(
  admin: SupabaseClient, filaId: string, piId: string, anterior: string | null,
): Promise<boolean> {
  const permitidos = [piId, ...(anterior && anterior !== piId ? [anterior] : [])];
  const { data, error } = await admin.from('pagos_clase')
    .update({ payment_intent_id: piId, referencia_stripe: piId, actualizado_en: new Date().toISOString() })
    .eq('id', filaId).eq('estado', 'ABIERTO')
    .or(`payment_intent_id.is.null,payment_intent_id.in.(${permitidos.join(',')})`)
    .select('id');
  if (error) return false;
  return (data?.length ?? 0) === 1;
}
