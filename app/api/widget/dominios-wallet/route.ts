import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeVer } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { registrarDominiosWalletEstudio } from '@/lib/billing/dominios-wallets';

export const dynamic = 'force-dynamic';

// Registra los dominios de wallets (Apple Pay/Google Pay/Link) del estudio
// sobre SU cuenta conectada de Stripe. Lo dispara GestionDominios
// (tab-api.tsx) tras guardar un dominio del widget — fire-and-forget: el
// guardado del dominio ya se hizo por su camino normal (updateStudio →
// Supabase directo desde el cliente), y por eso esto es un endpoint aparte y
// no un gancho en ese guardado: no existe ningún paso de servidor en esa
// escritura donde engancharse.
//
// Sin body a propósito: los dominios se leen SIEMPRE de la BD (lo que quedó
// guardado), nunca de lo que diga el navegador — así tampoco hay nada que
// validar del cliente. Idempotente: repetirlo no crea duplicados
// (lib/billing/dominios-wallets.ts hace list-antes-de-create).
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  // Mismo gate que la pantalla que lo dispara (Configuración → API/Widget).
  if (!puedeVer(sesion.rol, '/configuracion')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const { data: studio, error } = await admin
    .from('studios')
    .select('stripe_account_id, widget_dominios_autorizados')
    .eq('id', sesion.studioId)
    .maybeSingle();
  if (error || !studio) {
    return NextResponse.json({ error: 'No se pudo leer el estudio' }, { status: 500 });
  }

  // Sin Stripe conectado no hay cuenta sobre la que registrar nada: no-op
  // silencioso (el registro llegará con el callback de Connect al conectar).
  if (!studio.stripe_account_id) return NextResponse.json({ registrados: [] });

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_XXXX')) return NextResponse.json({ registrados: [] });

  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
  const resultados = await registrarDominiosWalletEstudio(
    stripe,
    studio.stripe_account_id,
    (studio.widget_dominios_autorizados as string[] | null) ?? [],
  );
  return NextResponse.json({ registrados: resultados });
}
