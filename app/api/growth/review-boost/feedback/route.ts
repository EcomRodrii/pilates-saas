import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { verificarSesionStaff } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { obtenerOCrearCuponReviewBoost } from '@/lib/billing/review-boost-cupon';
import { capturar } from '@/lib/analytics';
import { errorInterno } from '@/lib/errores-servidor';

// Feedback interno de Review Boost: 1-5 estrellas + comentario opcional. Solo
// PROPIETARIO (misma decisión que /configuracion → Facturación: es sobre la
// relación con la suscripción de Tentare, no caja diaria).
//
// 1-3 → queda en feedback interno, sin recompensa ni invitación externa.
// 4-5 → además concede la recompensa (20% primer mes) AQUÍ MISMO, desacoplada
// del clic en Capterra/GetApp — ver tentare-os.md, cumplimiento de sus normas.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'review-boost-feedback', { max: 5, windowSeconds: 60 });
  if (limited) return limited;

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede compartir esta opinión' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const body = await req.json().catch(() => null) as { rating?: number; comentario?: string } | null;
  const rating = body?.rating;
  if (!rating || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Falta una valoración de 1 a 5' }, { status: 400 });
  }
  const comentario = (body?.comentario ?? '').toString().trim().slice(0, 2000) || null;

  const { data: fila, error } = await admin
    .from('review_boost_feedback')
    .insert({ studio_id: sesion.studioId, rating, comentario })
    .select('id')
    .single();

  if (error) {
    // 23505 = unique(studio_id) — ya había dado feedback. No es un fallo del
    // cliente, es la guardia real de "no volver a pedirlo" en el esquema.
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ya nos habías compartido tu opinión, gracias de nuevo.' }, { status: 409 });
    }
    return errorInterno('growth/review-boost/feedback:POST', error, 'No se ha podido guardar tu opinión.');
  }

  const positivo = rating >= 4;
  capturar(sesion.studioId, { nombre: 'review_boost_feedback_submitted', props: { rating } });
  capturar(sesion.studioId, {
    nombre: positivo ? 'review_boost_positive_feedback' : 'review_boost_negative_feedback', props: { rating },
  });

  if (!positivo) {
    return NextResponse.json({ estado: 'negativo' });
  }

  // Recompensa: cupón único global, una fila por estudio (unique studio_id
  // en el esquema garantiza "una única utilización", no solo la lógica de
  // aquí). Sin Stripe configurado, se concede igualmente el agradecimiento en
  // pantalla — el canje real ocurre en el checkout, que ya comprueba modo.
  const key = process.env.STRIPE_SECRET_KEY;
  if (key && !key.startsWith('sk_test_XXXX')) {
    try {
      const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
      const cuponId = await obtenerOCrearCuponReviewBoost(stripe);
      await admin.from('review_boost_recompensas').insert({
        studio_id: sesion.studioId, feedback_id: fila.id, stripe_coupon_id: cuponId,
      });
      capturar(sesion.studioId, { nombre: 'review_boost_reward_offered', props: {} });
    } catch (err) {
      // La recompensa es un extra sobre el agradecimiento, no bloquea el
      // feedback ya guardado — se registra para investigarlo, no se falla la
      // petición (el estudio ya ve su "gracias" en pantalla).
      console.error('[review-boost/feedback] no se pudo conceder la recompensa', err);
    }
  }

  return NextResponse.json({ estado: 'positivo' });
}
