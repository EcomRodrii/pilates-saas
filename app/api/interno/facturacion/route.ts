import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import {
  cruzarFacturacion,
  type FilaCadena,
  type FilaEstudio,
} from '@/lib/interno/facturacion-real';

export const runtime = 'nodejs';
// Habla con Stripe: nunca cacheado. Un MRR de hace una hora es un MRR que miente.
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// El estado de cobro real de cada estudio, leído de Stripe.
//
// Por qué no basta con nuestras columnas: `subscription_status` lo escribe el
// webhook, y un webhook que se perdió deja la columna mintiendo para siempre.
// Aquí se pregunta a Stripe y se marca lo que no cuadre — ver la cabecera de
// `lib/interno/facturacion-real.ts` para el razonamiento completo.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'studios.read');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const [estudios, cadenas] = await Promise.all([
    db.from('studios').select('id, nombre, plan, subscription_status, stripe_customer_id, cadena_id'),
    db.from('cadenas').select('id, nombre, plan, subscription_status, stripe_customer_id'),
  ]);
  if (estudios.error) {
    return NextResponse.json({ error: estudios.error.message }, { status: 500 });
  }

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
      // Si Stripe falla NO se devuelve un MRR de 0: se devuelve el error para
      // que la pantalla diga «no he podido preguntar», que es distinto de
      // «no cobras nada».
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

  return NextResponse.json({ ...resultado, avisoStripe, suscripcionesEnStripe: subs.length });
}
