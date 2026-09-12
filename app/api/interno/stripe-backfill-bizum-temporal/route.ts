import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { exigirPermiso } from '@/lib/interno/auth';
import { solicitarCapacidadBizum } from '@/lib/billing/capacidad-bizum';

// ENDPOINT TEMPORAL — se borra tras usarlo una vez.
//
// #1874 arregló que cualquier conexión NUEVA a Stripe pida la capacidad
// `bizum_payments` sobre la cuenta conectada del estudio (causa raíz de que
// Bizum nunca apareciera en el checkout de nadie salvo la cuenta del
// fundador, que la pidió a mano por soporte). Pero ese código solo corre en
// el callback de OAuth — las 2 cuentas YA conectadas en producción antes de
// ese fix no se benefician solas: hace falta pedirla una vez, a mano, para
// ellas. Esta ruta hace exactamente eso, para los 2 `stripe_account_id`
// reales ya en `studios` — nunca para un id arbitrario del body (no hay
// parámetro que lo permita), justo para no dejar una puerta abierta a pedir
// capacidades sobre cualquier cuenta si esta ruta se quedara olvidada.
//
// Gateado a `admin.full` (el permiso más restrictivo del catálogo interno):
// esto muta cuentas reales de Stripe en producción, no es una lectura.
const CUENTAS_A_BACKFILLEAR = [
  { studioId: 'studio-1', nombre: 'Pilates Boutique', stripeAccount: 'acct_1TsuAiJyFtzyfjtm' },
  { studioId: 'studio-2valj72pqysx', nombre: 'Pilates doll', stripeAccount: 'acct_1U29sTFbC2xFUoJ2' },
] as const;

export async function POST(req: NextRequest) {
  const g = await exigirPermiso(req, 'admin.full');
  if ('error' in g) return g.error;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_XXXX')) {
    return NextResponse.json({ error: 'Stripe no configurado' }, { status: 503 });
  }
  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });

  const resultados = await Promise.all(
    CUENTAS_A_BACKFILLEAR.map(async (c) => {
      const r = await solicitarCapacidadBizum(stripe, c.stripeAccount);
      return { ...c, ...r };
    }),
  );

  return NextResponse.json({ resultados });
}
