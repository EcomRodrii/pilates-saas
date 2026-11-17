import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { comprobarModoStripe } from '@/lib/billing/modo-stripe';

// Lo común de las rutas de «Mi suscripción»: solo la propietaria, Stripe configurado y en un modo
// coherente, y de quién es la suscripción (la del estudio o la de su cadena).

export interface Contexto {
  admin: SupabaseClient;
  stripe: Stripe;
  studioId: string;
  subscriptionId: string;
  customerId: string;
  esCadena: boolean;
}

export type ResultadoContexto = { ok: true; ctx: Contexto } | { ok: false; respuesta: Response };

const fallo = (error: string, status: number): ResultadoContexto => ({ ok: false, respuesta: NextResponse.json({ error }, { status }) });

export async function cargarContexto(
  req: NextRequest, nombreLimite: string, opciones: { max: number; cobra: boolean },
): Promise<ResultadoContexto> {
  const limited = await enforceRateLimit(req, nombreLimite, { max: opciones.max, windowSeconds: 60 });
  if (limited) return { ok: false, respuesta: limited };
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_XXXX')) return fallo('Stripe no configurado', 503);
  if (opciones.cobra) {
    const modo = comprobarModoStripe();
    if (!modo.puedeCobrar) return fallo(modo.motivo ?? 'Stripe no está listo para cobrar en este entorno.', 503);
  }
  const admin = getSupabaseAdmin();
  if (!admin) return fallo('Servidor no configurado', 503);
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return fallo('No autorizado', 401);
  if (sesion.rol !== 'PROPIETARIO') return fallo('Solo la propietaria puede gestionar la suscripción', 403);

  const { data: estudio, error } = await admin.from('studios')
    .select('id, cadena_id, subscription_id, stripe_customer_id').eq('id', sesion.studioId).maybeSingle();
  if (error) return fallo('No se ha podido leer tu suscripción. Vuelve a intentarlo.', 500);
  if (!estudio) return fallo('Estudio no encontrado', 404);

  let subscriptionId = (estudio.subscription_id as string | null) ?? null;
  let customerId = (estudio.stripe_customer_id as string | null) ?? null;
  let esCadena = false;
  // Una cadena paga con UNA suscripción que vive en `cadenas`; si paga, manda sobre la de la sede.
  if (estudio.cadena_id) {
    const { data: cadena } = await admin.from('cadenas').select('subscription_id, stripe_customer_id').eq('id', estudio.cadena_id as string).maybeSingle();
    if (cadena?.subscription_id) {
      subscriptionId = cadena.subscription_id as string;
      customerId = (cadena.stripe_customer_id as string | null) ?? customerId;
      esCadena = true;
    }
  }
  if (!subscriptionId || !customerId) return fallo('Este estudio aún no tiene suscripción.', 409);
  return {
    ok: true,
    ctx: { admin, stripe: new Stripe(key, { apiVersion: '2026-06-24.dahlia' }), studioId: sesion.studioId, subscriptionId, customerId, esCadena },
  };
}

// La lectura y las operaciones viven en `operaciones.ts` (sin Next, para probarlas con un Stripe falso).
export { accionesDe, isoDe, leerSuscripcion } from './operaciones.ts';
