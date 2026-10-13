import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { estudioDeSlug } from '@/lib/regalo/estudio-publico';
import { esSesionDeRegalo } from '@/lib/regalo/sesion';
import { activarRegaloDesdeSesion } from '@/lib/regalo/stripe';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';

// La página de «gracias» pregunta aquí si el pago llegó. Si Stripe dice que está pagado y el
// webhook aún no ha creado la tarjeta, se crea AHORA con la misma función (idempotente por
// sesión): el regalo no depende de que el webhook llegue antes que la persona. No devuelve el
// código: va por correo.
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-regalo-estado', { max: 30, windowSeconds: 60 });
  if (limited) return limited;
  const sessionId = req.nextUrl.searchParams.get('session_id') ?? '';
  if (!/^cs_[A-Za-z0-9_]{10,200}$/.test(sessionId)) return NextResponse.json({ error: 'Sesión no válida' }, { status: 400 });
  const key = process.env.STRIPE_SECRET_KEY;
  const admin = getSupabaseAdmin();
  if (!admin || !key) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const estudio = await estudioDeSlug(admin, req.nextUrl.searchParams.get('slug'));
  if (!estudio?.stripeAccountId) return NextResponse.json({ error: 'Estudio no encontrado' }, { status: 404 });
  try {
    const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
    const sesion = await stripe.checkout.sessions.retrieve(sessionId, undefined, { stripeAccount: estudio.stripeAccountId });
    const meta = sesion.metadata as Record<string, string> | null;
    if (!esSesionDeRegalo(meta) || meta?.studioId !== estudio.id) return NextResponse.json({ error: 'Sesión no válida' }, { status: 404 });
    if (sesion.payment_status !== 'paid') return NextResponse.json({ estado: 'pendiente' });
    const r = await activarRegaloDesdeSesion(admin, sesion, estudio.id, stripe, estudio.stripeAccountId);
    if (!r.ok) return NextResponse.json({ estado: 'revisar' });
    return NextResponse.json({ estado: 'pagado', destinatarioNombre: meta?.destinatarioNombre ?? null, importeEur: Number(meta?.importeEur) });
  } catch (err) {
    return errorInterno('public/regalo/estado:GET', err, 'No hemos podido comprobar el pago.');
  }
}
