import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { secretoValido } from '@/lib/salud/secreto';
import { requireSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { rellenarLibro } from '@/lib/billing/libro/relleno';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Relleno único del libro de billing con lo que ya hay en Stripe (lib/billing/libro/relleno.ts).
// NO está en ningún horario: se lanza a mano desde Postgres (pg_net + el secreto de Vault, el
// mismo patrón que los crons) con `{"ejecutar": true}`. Sin ese campo es un ensayo que solo
// cuenta lo que haría. Solo lee de Stripe y es idempotente.
export async function POST(req: NextRequest) {
  const secret = process.env.SUPABASE_CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'SUPABASE_CRON_SECRET no configurado' }, { status: 503 });
  if (!secretoValido(req.headers.get('authorization'), secret)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const clave = process.env.STRIPE_SECRET_KEY;
  if (!clave || clave.startsWith('sk_test_XXXX')) return NextResponse.json({ error: 'Stripe no configurado' }, { status: 503 });

  const body = await req.json().catch(() => null) as { ejecutar?: unknown } | null;
  try {
    const stripe = new Stripe(clave, { apiVersion: '2026-06-24.dahlia' });
    const r = await rellenarLibro(requireSupabaseAdmin(), stripe, { ejecutar: body?.ejecutar === true });
    return NextResponse.json(r, { status: r.errores.length > 0 ? 500 : 200 });
  } catch (err) {
    return errorInterno('cron/billing-relleno:POST', err, 'Error rellenando el libro de billing.');
  }
}
