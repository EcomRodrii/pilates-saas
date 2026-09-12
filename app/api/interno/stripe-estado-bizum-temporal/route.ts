import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { exigirPermiso } from '@/lib/interno/auth';

// ENDPOINT TEMPORAL, SOLO LECTURA — se borra tras usarlo una vez.
//
// #1883 arregló que un checkout no fuerce `bizum` sin comprobar que la
// cuenta CONECTADA tiene la capacidad `active` (si no, Stripe tumbaba el
// cobro ENTERO, tarjeta incluida). Pero eso no cambia si la capacidad está
// activa o no -- solo evita que romper por intentarlo. Esta ruta consulta
// el estado REAL, ahora mismo, de las 2 cuentas conectadas que existen en
// producción (ver #1876/#1878) -- nunca un id arbitrario del body, para no
// dejar una puerta abierta a consultar cualquier cuenta si se olvidara.
//
// No muta nada (solo `accounts.retrieve`). Gateado a `admin.full` igual que
// el resto de rutas internas que hablan con Stripe.
const CUENTAS = [
  { studioId: 'studio-1', nombre: 'Pilates Boutique', stripeAccount: 'acct_1TsuAiJyFtzyfjtm' },
  { studioId: 'studio-2valj72pqysx', nombre: 'Pilates doll', stripeAccount: 'acct_1U29sTFbC2xFUoJ2' },
] as const;

export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'admin.full');
  if ('error' in g) return g.error;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_XXXX')) {
    return NextResponse.json({ error: 'Stripe no configurado' }, { status: 503 });
  }
  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });

  const resultados = await Promise.all(
    CUENTAS.map(async (c) => {
      try {
        const cuenta = await stripe.accounts.retrieve(c.stripeAccount);
        return { ...c, ok: true, estado: cuenta.capabilities?.bizum_payments ?? null };
      } catch (e) {
        return { ...c, ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );

  return NextResponse.json({ resultados });
}
