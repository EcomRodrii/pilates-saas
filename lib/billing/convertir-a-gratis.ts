import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import * as Sentry from '@sentry/nextjs';
// Rutas relativas: lo importan crons que también se cargan en `node --test`.
import { encendidaPara } from '../interruptor-por-estudio.ts';
import { ESTADOS_VIVOS, leerPagosDelCliente } from './checkout-saas-previo.ts';
import { ESTADO_GRATIS, ESTADO_GRATIS_CERRADO, pasaAGratis } from './plan-gratis.ts';

// ─────────────────────────────────────────────────────────────────────────────
// El ÚNICO sitio que pasa un estudio a Founding Studio gratis (y lo cierra al
// acabar el margen). Lo llaman el gate (/api/billing/status) y los dos crons
// que, si no, mandarían avisos de prueba o de baja a quien ya es gratis.
//
// · Solo con el interruptor FOUNDING_GRATIS encendido para ese estudio.
// · Solo a quien no paga (`pasaAGratis`): nunca una sede, ni un Checkout a
//   medias, ni una suscripción impagada que Stripe aún no ha cancelado.
// · Si tiene cliente en Stripe, se pregunta a Stripe ANTES: un webhook perdido
//   deja la fila en 'trialing' local mientras Stripe ya cobra (pasó el 18-21 de
//   agosto). Con una suscripción viva no se convierte: se avisa a Sentry. Si
//   Stripe no contesta, tampoco: mejor un día más sin el plan gratis que
//   dejar a alguien que paga con los límites del gratis.
// · Escritura compare-and-set contra lo que se leyó (estado, subscription_id):
//   si el webhook ha escrito algo en medio, no se pisa. NUNCA se toca
//   `subscription_evento_en`: un evento real anterior que llegase después se
//   descartaría como desordenado.
// · Al convertir se borra la medición vieja: una fecha de exceso de antes de un
//   periodo de pago no puede dejarlo cerrado el primer día.
// ─────────────────────────────────────────────────────────────────────────────

export interface FilaParaGratis {
  id: string;
  subscription_status: string | null;
  subscription_id: string | null;
  cadena_id: string | null;
  stripe_customer_id: string | null;
  /** Pidió borrar sus datos: no se le resucita. */
  supresion_pedida_en?: string | null;
}

export const COLUMNAS_PARA_GRATIS = 'id, subscription_status, subscription_id, cadena_id, stripe_customer_id, supresion_pedida_en';

export type ResultadoConversion = 'convertido' | 'no-toca' | 'paga-en-stripe' | 'sin-respuesta-de-stripe' | 'cambio-en-medio';

function stripePlataforma(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_XXXX')) return null;
  return new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
}

export interface OpcionesConversion {
  /** Para las pruebas; por defecto, el de la cuenta de plataforma. */
  stripe?: Pick<Stripe, 'subscriptions' | 'checkout'> | null;
  entorno?: Record<string, string | undefined>;
}

/** Si toca, pasa el estudio a 'gratis' (plan BASE). Dice qué ha pasado. */
export async function convertirAGratisSiToca(admin: SupabaseClient, fila: FilaParaGratis, opciones: OpcionesConversion = {}): Promise<ResultadoConversion> {
  const entorno = opciones.entorno ?? process.env;
  if (!encendidaPara(entorno.FOUNDING_GRATIS, fila.id)) return 'no-toca';
  if (fila.supresion_pedida_en) return 'no-toca';
  if (!pasaAGratis({ subscriptionStatus: fila.subscription_status, subscriptionId: fila.subscription_id, cadenaId: fila.cadena_id })) return 'no-toca';

  if (fila.stripe_customer_id) {
    const stripe = opciones.stripe !== undefined ? opciones.stripe : stripePlataforma();
    if (!stripe) return 'sin-respuesta-de-stripe';
    let viva: { status: string } | undefined;
    try {
      const { suscripciones } = await leerPagosDelCliente(stripe, fila.stripe_customer_id);
      viva = suscripciones.find(s => ESTADOS_VIVOS.includes(s.status));
    } catch {
      return 'sin-respuesta-de-stripe';
    }
    if (viva) {
      // El aviso no puede tumbar la decisión: fuera del try de Stripe y con el suyo.
      try {
        Sentry.captureMessage('[plan gratis] no se pasa a gratis: Stripe tiene una suscripción viva que la base no sabe', {
          level: 'warning', tags: { area: 'billing' }, extra: { studioId: fila.id, estadoEnBd: fila.subscription_status, estadoEnStripe: viva.status },
        });
      } catch { /* sin Sentry, la decisión es la misma */ }
      return 'paga-en-stripe';
    }
  }

  let q = admin.from('studios').update({ subscription_status: ESTADO_GRATIS, plan: 'BASE' })
    .eq('id', fila.id).is('cadena_id', null);
  q = fila.subscription_status === null ? q.is('subscription_status', null) : q.eq('subscription_status', fila.subscription_status);
  q = fila.subscription_id === null ? q.is('subscription_id', null) : q.eq('subscription_id', fila.subscription_id);
  const { data, error } = await q.select('id');
  if (error || !data?.length) return 'cambio-en-medio';

  // Empieza de cero: ni la fecha de exceso ni las cifras de antes valen.
  await admin.from('uso_plan_gratis').delete().eq('studio_id', fila.id);
  return 'convertido';
}

/** Acabado el margen: 'gratis' → 'gratis_cerrado' (sin acceso para todo el servidor). Compare-and-set. */
export async function cerrarPlanGratis(admin: SupabaseClient, studioId: string): Promise<boolean> {
  const { data, error } = await admin.from('studios').update({ subscription_status: ESTADO_GRATIS_CERRADO })
    .eq('id', studioId).eq('subscription_status', ESTADO_GRATIS).select('id');
  return !error && !!data?.length;
}
