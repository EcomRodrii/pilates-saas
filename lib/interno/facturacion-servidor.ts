import 'server-only';
import Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cruzarFacturacion, type FacturacionReal, type FilaCadena, type FilaEstudio } from './facturacion-real.ts';

/**
 * El estado de cobro real de cada estudio, preguntado a Stripe y cruzado con la
 * base. Lo comparten /interno → Facturación y /interno → Hoy: dos pantallas que
 * calculasen el dinero cada una a su manera serían peor que una mal (nunca
 * sabrías cuál miente). Ver la cabecera de `facturacion-real.ts`.
 *
 * Si Stripe falla NO se devuelve un MRR de 0: `avisoStripe` dice por qué, y
 * quien lo pinte enseña «no he podido preguntar», que es distinto de «no cobras
 * nada». `null` solo si no se pudo leer la base.
 */
export async function leerFacturacion(db: SupabaseClient): Promise<
  { resultado: FacturacionReal; subs: Stripe.Subscription[]; avisoStripe: string | null } | null
> {
  const [estudios, cadenas] = await Promise.all([
    db.from('studios').select('id, nombre, plan, subscription_status, stripe_customer_id, cadena_id'),
    db.from('cadenas').select('id, nombre, plan, subscription_status, stripe_customer_id'),
  ]);
  if (estudios.error) return null;

  const key = process.env.STRIPE_SECRET_KEY;
  let subs: Stripe.Subscription[] = [];
  let avisoStripe: string | null = null;

  if (key) {
    try {
      const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
      // Todas las suscripciones de la cuenta de PLATAFORMA (lo que los estudios
      // nos pagan). Las de Connect son cobros de las socias a su estudio y no
      // son ingreso nuestro: no se listan aquí a propósito.
      //
      // `status: 'all'` porque las canceladas e impagadas son justo las que hay
      // que ver. `expand` trae el precio para calcular el importe de verdad.
      for await (const sub of stripe.subscriptions.list({
        status: 'all',
        limit: 100,
        expand: ['data.items.data.price'],
      })) {
        subs.push(sub);
      }
    } catch (e) {
      avisoStripe = e instanceof Error ? e.message : 'Stripe no respondió';
      subs = [];
    }
  } else {
    avisoStripe = 'STRIPE_SECRET_KEY no está configurada en este entorno';
  }

  const resultado = cruzarFacturacion(
    (estudios.data ?? []) as unknown as FilaEstudio[],
    (cadenas.data ?? []) as unknown as FilaCadena[],
    subs,
    avisoStripe === null,
  );
  return { resultado, subs, avisoStripe };
}
