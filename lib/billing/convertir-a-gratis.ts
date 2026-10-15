import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import * as Sentry from '@sentry/nextjs';
// Rutas relativas: lo importan crons que también se cargan en `node --test`.
import { encendidaPara } from '../interruptor-por-estudio.ts';
import { ESTADOS_VIVOS, leerPagosDelCliente } from './checkout-saas-previo.ts';
import { ESTADO_GRATIS, ESTADO_GRATIS_CERRADO, empiezaDeCeroAlConvertir, pasaAGratis, type CadenaParaGratis } from './plan-gratis.ts';

// ─────────────────────────────────────────────────────────────────────────────
// El ÚNICO sitio que pasa un estudio a Founding Studio gratis (y lo cierra al
// acabar el margen). Lo llaman el gate (/api/billing/status) y los dos crons
// que, si no, mandarían avisos de prueba o de baja a quien ya es gratis.
//
// · Solo con el interruptor FOUNDING_GRATIS encendido para ese estudio.
// · Solo a quien no paga (`pasaAGratis`): ni un Checkout a medias, ni una
//   suscripción impagada que Stripe aún no ha cancelado. De una cadena, solo
//   su sede PRINCIPAL y solo si la cadena ya no paga (las demás sedes siguen
//   cerradas hasta que vuelva a pagar Cadena; decisión del 15-oct-2026).
// · Si tiene cliente en Stripe, se pregunta a Stripe ANTES: un webhook perdido
//   deja la fila en 'trialing' local mientras Stripe ya cobra (pasó el 18-21 de
//   agosto). Con una suscripción viva no se convierte: se avisa a Sentry. Si
//   Stripe no contesta, tampoco: mejor un día más sin el plan gratis que
//   dejar a alguien que paga con los límites del gratis. En una sede se
//   pregunta también por el cliente de la CADENA: un webhook perdido de la
//   cadena es el mismo caso.
// · Escritura compare-and-set contra lo que se leyó (estado, subscription_id):
//   si el webhook ha escrito algo en medio, no se pisa. NUNCA se toca
//   `subscription_evento_en`: un evento real anterior que llegase después se
//   descartaría como desordenado.
// · Al convertir tras un periodo PAGADO ('canceled') se borra la medición vieja:
//   una fecha de exceso de antes no puede dejarlo cerrado el primer día. Desde un
//   pago abandonado o una prueba, se conserva (`empiezaDeCeroAlConvertir`): si
//   no, un 'gratis_cerrado' se reabriría con 30 días más.
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

export type ResultadoConversion =
  | 'convertido' | 'no-toca' | 'paga-en-stripe' | 'sin-respuesta-de-stripe' | 'cambio-en-medio'
  /** Una sede cuya cadena no se pudo leer: ni se convierte ni se da por decidido. */
  | 'sin-leer-la-cadena';

/** La cadena de una sede, con lo que hace falta para decidir y preguntar a Stripe. */
export interface CadenaLeida extends CadenaParaGratis {
  stripeCustomerId: string | null;
}

/**
 * La cadena de la sede, si la sede es la PRINCIPAL (la más antigua de la
 * cadena: plan-gratis.ts explica por qué) y si otra sede ya está en el gratis.
 * `null` si el estudio no tiene cadena o la cadena no aparece; lanza si una
 * lectura falla.
 */
export async function leerCadenaParaGratis(admin: SupabaseClient, fila: Pick<FilaParaGratis, 'id' | 'cadena_id'>): Promise<CadenaLeida | null> {
  if (!fila.cadena_id) return null;
  const [cadena, primera, otraGratis] = await Promise.all([
    admin.from('cadenas').select('subscription_status, subscription_id, stripe_customer_id').eq('id', fila.cadena_id).maybeSingle(),
    admin.from('studios').select('id').eq('cadena_id', fila.cadena_id)
      .order('creado_en', { ascending: true, nullsFirst: false }).order('id', { ascending: true }).limit(1),
    admin.from('studios').select('id').eq('cadena_id', fila.cadena_id).neq('id', fila.id)
      .in('subscription_status', [ESTADO_GRATIS, ESTADO_GRATIS_CERRADO]).limit(1),
  ]);
  if (cadena.error) throw new Error(`leer cadena: ${cadena.error.message}`);
  if (primera.error) throw new Error(`leer sedes de la cadena: ${primera.error.message}`);
  if (otraGratis.error) throw new Error(`leer sedes gratis de la cadena: ${otraGratis.error.message}`);
  const c = cadena.data as { subscription_status: string | null; subscription_id: string | null; stripe_customer_id: string | null } | null;
  if (!c) return null;
  const principal = ((primera.data ?? []) as { id: string }[])[0]?.id ?? null;
  return {
    subscriptionStatus: c.subscription_status,
    subscriptionId: c.subscription_id,
    stripeCustomerId: c.stripe_customer_id,
    esPrincipal: principal === fila.id,
    otraSedeGratis: (otraGratis.data ?? []).length > 0,
  };
}

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
  const datos = { subscriptionStatus: fila.subscription_status, subscriptionId: fila.subscription_id, cadenaId: fila.cadena_id };
  // Lo barato primero: lo que no pasaría a gratis ni siendo la principal de una
  // cadena que no paga no lee nada más.
  if (!pasaAGratis({ ...datos, cadenaId: null })) return 'no-toca';
  let cadena: CadenaLeida | null = null;
  if (fila.cadena_id) {
    try {
      cadena = await leerCadenaParaGratis(admin, fila);
    } catch {
      return 'sin-leer-la-cadena';
    }
    if (!pasaAGratis({ ...datos, cadena })) return 'no-toca';
  }

  // El cliente del estudio y, en una sede, el de su cadena (las migradas en la
  // 0066 comparten uno): ninguno puede tener una suscripción viva.
  const clientes = [...new Set([fila.stripe_customer_id, cadena?.stripeCustomerId].filter((c): c is string => !!c))];
  if (clientes.length > 0) {
    const stripe = opciones.stripe !== undefined ? opciones.stripe : stripePlataforma();
    if (!stripe) return 'sin-respuesta-de-stripe';
    let viva: { status: string } | undefined;
    try {
      for (const cliente of clientes) {
        const { suscripciones } = await leerPagosDelCliente(stripe, cliente);
        viva = suscripciones.find(s => ESTADOS_VIVOS.includes(s.status));
        if (viva) break;
      }
    } catch {
      return 'sin-respuesta-de-stripe';
    }
    if (viva) {
      // El aviso no puede tumbar la decisión: fuera del try de Stripe y con el suyo.
      try {
        Sentry.captureMessage('[plan gratis] no se pasa a gratis: Stripe tiene una suscripción viva que la base no sabe', {
          level: 'warning', tags: { area: 'billing' },
          extra: { studioId: fila.id, cadenaId: fila.cadena_id, estadoEnBd: fila.subscription_status, estadoCadenaEnBd: cadena?.subscriptionStatus ?? null, estadoEnStripe: viva.status },
        });
      } catch { /* sin Sentry, la decisión es la misma */ }
      return 'paga-en-stripe';
    }
  }

  // Compare-and-set también contra la cadena leída: si la sede cambió de cadena
  // (o una suelta pasó a tener una) en medio, no se toca.
  let q = admin.from('studios').update({ subscription_status: ESTADO_GRATIS, plan: 'BASE' }).eq('id', fila.id);
  q = fila.cadena_id ? q.eq('cadena_id', fila.cadena_id) : q.is('cadena_id', null);
  q = fila.subscription_status === null ? q.is('subscription_status', null) : q.eq('subscription_status', fila.subscription_status);
  q = fila.subscription_id === null ? q.is('subscription_id', null) : q.eq('subscription_id', fila.subscription_id);
  const { data, error } = await q.select('id');
  if (error || !data?.length) return 'cambio-en-medio';

  // Tras un periodo pagado empieza de cero: ni la fecha de exceso ni las cifras
  // de antes valen. Si no, se conservan (`empiezaDeCeroAlConvertir`).
  if (empiezaDeCeroAlConvertir(fila.subscription_status)) await admin.from('uso_plan_gratis').delete().eq('studio_id', fila.id);
  return 'convertido';
}

/** Acabado el margen: 'gratis' → 'gratis_cerrado' (sin acceso para todo el servidor). Compare-and-set. */
export async function cerrarPlanGratis(admin: SupabaseClient, studioId: string): Promise<boolean> {
  const { data, error } = await admin.from('studios').update({ subscription_status: ESTADO_GRATIS_CERRADO })
    .eq('id', studioId).eq('subscription_status', ESTADO_GRATIS).select('id');
  return !error && !!data?.length;
}
