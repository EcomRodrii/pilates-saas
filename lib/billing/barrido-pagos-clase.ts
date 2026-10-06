// ─────────────────────────────────────────────────────────────────────────────
// El barrido de los pagos de clase (P06 · Fase A), DENTRO del conciliador horario
// (sin cron nuevo: Inngest va justo de cuota).
//
// Lo que el webhook no cerró:
//   · PAGADO desde hace un rato (el webhook cobró y la reserva falló o el proceso
//     murió): se vuelve a intentar la reserva; al tercer fallo, COMPENSADA ERROR
//     con aviso al mostrador (`reservarClasePagada`).
//   · ABIERTO con su cobro ya pagado en Stripe y el plan entregado (el webhook se
//     perdió y la entrega la hizo el conciliador): se marca PAGADO y se reserva.
//   · ABIERTO con un cobro abandonado (nadie lo ha tocado en `ABANDONO_PI_SEGUNDOS`,
//     2 h, contando desde la ÚLTIMA vez que se le entregó: reabrir la hoja lo renueva):
//     se cancela en Stripe y, SOLO si Stripe confirma, la fila pasa a CANCELADO y
//     vuelve lo retenido. Un 3DS a medias (`requires_action`) también, con el mismo plazo
//     (antes no se cancelaba nunca y bloqueaba la clase de prueba en otra clase).
//   · ABIERTO sin cobro hace 45 min (la petición murió antes de crearlo): CANCELADO,
//     y su matrícula gratis vuelve (una vez, con la clave de la fila, la misma que usa el
//     conciliador con el cobro cancelado: `claveMatriculaDePagoClase`).
//   · Orden por `actualizado_en`, y lo que no se puede resolver todavía (cobrándose,
//     3DS a medias) se «toca» al pasar: va al final de la cola y no tapa a las nuevas
//     (el `limit` no se queda atascado en las mismas 50 filas).
//
// La regla es pura (`queHacerEnElBarrido`); aquí, la base y Stripe.
// Imports relativos: lo importa `lib/inngest/conciliar-cobros.ts`.
// ─────────────────────────────────────────────────────────────────────────────
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { idsDe } from './ids-compra.ts';
import { reservarClasePagada } from './reservar-clase-pagada.ts';
import { plazaDePICancelado } from './cupo-matricula-abandonado.ts';
import { liberarCupoMatriculaUnaVez } from './matricula-online.ts';
import { liberarPlazaPorRef } from '../opening/cupo.ts';
import { ABANDONO_PI_SEGUNDOS, claveMatriculaDePagoClase } from './cupo-matricula-abandonado.ts';
import { esTablaQueFalta } from '../db/tabla-que-falta.ts';

/** Un PAGADO se reintenta pasado este rato (el webhook está terminando, o murió). */
export const MINUTOS_REINTENTO_PAGADO = 10;
/** Un pago abierto SIN cobro (la petición murió antes de crearlo) se cierra pasado este rato. */
export const MINUTOS_ABANDONO = 45;
/** Un cobro abierto que nadie toca se cancela pasado este rato desde su última entrega (el de la matrícula). */
export const MINUTOS_ABANDONO_COBRO = ABANDONO_PI_SEGUNDOS / 60;

export interface FilaBarrido {
  id: string;
  estado: string;
  socio_id: string | null;
  sesion_id: string;
  spot_id: string | null;
  payment_intent_id: string | null;
  creado_en: string;
  actualizado_en: string;
  plan_id?: string;
  cupo_matricula?: boolean;
}

/** `al-final`: nada que hacer todavía y no se sabe cuándo (cobrándose, 3DS a medias): se manda al final de la cola. */
export type AccionBarrido = 'reservar' | 'cancelar-cobro' | 'cerrar-sin-cobro' | 'al-final' | 'nada';

const PAGANDOSE = new Set(['processing', 'requires_capture']);
const ABANDONABLE = new Set(['requires_payment_method', 'requires_confirmation']);

/**
 * `estadoPI`: el del cobro en Stripe si se conoce (`undefined` = no se ha mirado;
 * `null` = no se pudo). `entregado`: existe el `rec-web` del cobro (el plan está).
 */
export function queHacerEnElBarrido(f: FilaBarrido, ahoraMs: number, estadoPI: string | null | undefined, entregado: boolean): AccionBarrido {
  const minDesde = (iso: string) => (ahoraMs - new Date(iso).getTime()) / 60_000;
  if (f.estado === 'PAGADO') return minDesde(f.actualizado_en) >= MINUTOS_REINTENTO_PAGADO ? 'reservar' : 'nada';
  if (f.estado !== 'ABIERTO') return 'nada';
  if (!f.payment_intent_id) return minDesde(f.actualizado_en) >= MINUTOS_ABANDONO ? 'cerrar-sin-cobro' : 'nada';
  if (estadoPI === 'succeeded') return entregado ? 'reservar' : 'nada'; // sin entregar: lo entrega el conciliador primero
  if (estadoPI === 'canceled') return 'cerrar-sin-cobro';
  if (estadoPI && PAGANDOSE.has(estadoPI)) return 'al-final';
  // Un 3DS a medias: el banco puede tardar, pero no 2 h. Pasado `ABANDONO_PI_SEGUNDOS` desde su última entrega se
  // cancela (si el banco lo aprueba después, el cobro falla: nunca dos cobros); antes, al final de la cola.
  if (estadoPI === 'requires_action') return minDesde(f.actualizado_en) >= MINUTOS_ABANDONO_COBRO ? 'cancelar-cobro' : 'al-final';
  if (estadoPI && ABANDONABLE.has(estadoPI)) return minDesde(f.actualizado_en) >= MINUTOS_ABANDONO_COBRO ? 'cancelar-cobro' : 'nada';
  return 'nada';
}

export async function barrerPagosDeClase(
  admin: SupabaseClient, stripe: Stripe, studio: { id: string; stripe_account_id: string },
  pisListados: Map<string, Stripe.PaymentIntent>,
): Promise<{ reservados: number; cancelados: number }> {
  const hace = new Date(Date.now() - MINUTOS_REINTENTO_PAGADO * 60_000).toISOString();
  const { data, error } = await admin.from('pagos_clase')
    .select('id, estado, socio_id, sesion_id, spot_id, payment_intent_id, creado_en, actualizado_en, plan_id, cupo_matricula')
    .eq('studio_id', studio.id).in('estado', ['ABIERTO', 'PAGADO']).lt('creado_en', hace)
    .order('actualizado_en', { ascending: true }).limit(50);
  if (error) {
    // Tabla aún sin aplicar: no hay nada que barrer.
    if (!esTablaQueFalta(error)) {
      Sentry.captureMessage('[conciliador] no se pudieron leer los pagos de clase', { level: 'warning', tags: { area: 'cobros' }, extra: { studioId: studio.id, detalle: error.message } });
    }
    return { reservados: 0, cancelados: 0 };
  }
  let reservados = 0;
  let cancelados = 0;
  for (const f of (data ?? []) as FilaBarrido[]) {
    try {
      let pi: Stripe.PaymentIntent | null = f.payment_intent_id ? pisListados.get(f.payment_intent_id) ?? null : null;
      let estadoPI: string | null | undefined = pi?.status;
      if (f.payment_intent_id && !pi && f.estado === 'ABIERTO') {
        try {
          pi = await stripe.paymentIntents.retrieve(f.payment_intent_id, undefined, { stripeAccount: studio.stripe_account_id });
          estadoPI = pi.status;
        } catch { estadoPI = null; }
      }
      let socioEntregado: string | null = null;
      if (f.payment_intent_id) {
        const { data: rec } = await admin.from('recibos').select('socio_id')
          .eq('id', idsDe(f.payment_intent_id).reciboId).eq('studio_id', studio.id).maybeSingle();
        socioEntregado = (rec?.socio_id as string | null | undefined) ?? null;
      }
      const accion = queHacerEnElBarrido(f, Date.now(), estadoPI, !!socioEntregado);
      if (accion === 'reservar' && socioEntregado && f.payment_intent_id) {
        const { data: sus } = await admin.from('suscripciones').select('id')
          .eq('id', idsDe(f.payment_intent_id).suscripcionId).eq('studio_id', studio.id).maybeSingle();
        await reservarClasePagada(admin, {
          studioId: studio.id, sesionId: f.sesion_id, socioId: socioEntregado, paymentIntentId: f.payment_intent_id,
          spotId: f.spot_id, via: 'conciliador', referencia: { paymentIntentId: f.payment_intent_id },
          pagoClaseId: f.id, suscripcionEntregadaId: (sus?.id as string | undefined) ?? null,
        });
        reservados += 1;
      } else if (accion === 'cancelar-cobro' && f.payment_intent_id) {
        let c: Stripe.PaymentIntent | null = null;
        try {
          c = await stripe.paymentIntents.cancel(f.payment_intent_id, { cancellation_reason: 'abandoned' }, {
            stripeAccount: studio.stripe_account_id, idempotencyKey: `pago-clase-cancelar-${f.payment_intent_id}`,
          });
        } catch { c = null; }
        // Solo con Stripe diciendo «cancelado»: un cobro que se acaba de pagar no se toca.
        if (c?.status === 'canceled' && await cerrarFila(admin, studio.id, f.id)) {
          await devolverRetenido(admin, studio.id, c);
          cancelados += 1;
        }
      } else if (accion === 'cerrar-sin-cobro') {
        if (await cerrarFila(admin, studio.id, f.id)) {
          if (pi?.status === 'canceled') await devolverRetenido(admin, studio.id, pi);
          // Sin cobro no hay metadata de la que leer la matrícula: la dice la fila (una vez, con su clave).
          else if (!f.payment_intent_id && f.cupo_matricula && f.plan_id) {
            await liberarCupoMatriculaUnaVez(admin, claveMatriculaDePagoClase(f.id), f.plan_id, studio.id)
              .catch(() => { /* sin anotar: se queda retenida y Sentry lo cuenta abajo si se repite */ });
          }
          cancelados += 1;
        }
      } else if (accion === 'al-final') {
        // Cobrándose o con el 3DS a medias: nada que hacer todavía. Se toca para que pase al final
        // de la cola (orden por `actualizado_en`) y no ocupe siempre el mismo hueco del `limit`.
        await admin.from('pagos_clase').update({ actualizado_en: new Date().toISOString() })
          .eq('id', f.id).eq('studio_id', studio.id).eq('estado', 'ABIERTO');
      }
    } catch (e) {
      Sentry.captureException(e instanceof Error ? e : new Error('barrido de pagos de clase'), {
        level: 'warning', tags: { area: 'cobros', tipo: 'barrido-pagos-clase' }, extra: { studioId: studio.id, pagoClaseId: f.id },
      });
    }
  }
  return { reservados, cancelados };
}

async function cerrarFila(admin: SupabaseClient, studioId: string, id: string): Promise<boolean> {
  const { data, error } = await admin.rpc('registrar_resultado_pago_clase', { p_id: id, p_studio_id: studioId, p_estado: 'CANCELADO' });
  return !error && !!(data as { cambiado: boolean }[] | null)?.[0]?.cambiado;
}

async function devolverRetenido(admin: SupabaseClient, studioId: string, pi: Stripe.PaymentIntent): Promise<void> {
  await liberarPlazaPorRef(admin, pi.id);
  const m = plazaDePICancelado(pi);
  if (m) await liberarCupoMatriculaUnaVez(admin, m.clave, m.planId, studioId).catch(() => { /* el barrido de matrícula la devuelve */ });
}
