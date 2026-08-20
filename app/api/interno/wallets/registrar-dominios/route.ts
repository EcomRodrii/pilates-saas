import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { exigirPermiso } from '@/lib/interno/auth';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { registrarDominiosWalletEstudio } from '@/lib/billing/dominios-wallets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Catch-up ONE-SHOT (aunque repetible sin daño: todo el camino es idempotente)
// para las cuentas de Stripe YA conectadas antes de que existiera el registro
// automático de dominios de wallets (lib/billing/dominios-wallets.ts). Los
// estudios existentes no van a pasar otra vez por el callback de Connect, así
// que sin esto Apple Pay seguiría sin aparecer en sus checkouts para siempre.
//
// Recorre los estudios con `stripe_account_id` y registra sobre cada cuenta
// conectada: www.tentare.app + ápice (Modo A) + sus dominios de widget
// autorizados (Modo B).
//
// Ejecutar tras el deploy, con una sesión del panel interno (/interno):
//   fetch('/api/interno/wallets/registrar-dominios', { method: 'POST',
//     headers: { Authorization: `Bearer ${TOKEN_DE_LA_SESION}` } })
// La respuesta lista el resultado por estudio y dominio para verificar.
export async function POST(req: NextRequest) {
  const g = await exigirPermiso(req, 'studios.update');
  if ('error' in g) return g.error;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_XXXX')) {
    return NextResponse.json({ error: 'Stripe no configurado' }, { status: 503 });
  }
  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });

  // Paginado explícito: PostgREST corta en 1000 filas en silencio, y este
  // barrido tiene que ver TODOS los estudios con cuenta conectada.
  const estudios: { id: string; nombre: string; stripe_account_id: string; widget_dominios_autorizados: string[] | null }[] = [];
  const PAGINA = 500;
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await admin
      .from('studios')
      .select('id, nombre, stripe_account_id, widget_dominios_autorizados')
      .not('stripe_account_id', 'is', null)
      .order('id')
      .range(desde, desde + PAGINA - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    estudios.push(...((data ?? []) as typeof estudios));
    if (!data || data.length < PAGINA) break;
  }

  const resultados = [];
  for (const e of estudios) {
    // En serie estudio a estudio: pocas cuentas, y así un rate-limit de
    // Stripe no convierte el barrido en una tormenta.
    const dominios = await registrarDominiosWalletEstudio(
      stripe, e.stripe_account_id, e.widget_dominios_autorizados ?? [],
    );
    resultados.push({ studioId: e.id, nombre: e.nombre, stripeAccount: e.stripe_account_id, dominios });
  }

  return NextResponse.json({
    estudios: resultados.length,
    conFallos: resultados.filter(r => r.dominios.some(d => !d.ok)).length,
    resultados,
  });
}
