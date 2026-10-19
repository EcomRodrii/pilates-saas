import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { verificarSesionStaff } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { addonDePriceId, planDePriceId, priceIdDe } from '@/lib/billing/billing';
import { comprobarModoStripe } from '@/lib/billing/modo-stripe';
import { lecturaSuscripcion } from '@/lib/billing/lectura-suscripcion';
import { COLUMNAS_PLAN, planDeFila } from '@/lib/billing/entitlements';
import { itemsParaPasarAEstudio, MENSAJE_NO_CAMBIO_PLAN, motivoNoCambioPlan } from '@/lib/billing/cambio-plan-reglas';
import { claveCheckoutLock, liberarCheckoutLock, reclamarCheckoutLock } from '@/lib/billing/checkout-lock';
import { errorInterno } from '@/lib/errores-servidor';

// Pasar de Founding Studio (con o sin complementos) a Estudio (19-oct-2026). El
// portal de Stripe no cambia el plan de una suscripción con varias líneas, y una
// Founding con complementos las tiene: aquí se hace en UNA actualización (el plan
// pasa a Estudio y las líneas de complemento se borran, que Estudio ya los
// incluye), con la parte proporcional en la próxima factura, igual que activar un
// complemento. Reglas en lib/billing/cambio-plan-reglas.ts.
//
// Dinero: mismo patrón que /api/billing/addons. Solo la propietaria, guardia de
// modo de Stripe, el cerrojo del checkout, decide con lo que tiene Stripe (no la
// fila) y, después, vuelve a LEER Stripe y guarda lo que hay de verdad. El webhook
// hará lo mismo con su evento.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'billing-cambiar-plan', { max: 5, windowSeconds: 60 });
  if (limited) return limited;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_XXXX')) {
    return NextResponse.json({ error: 'Stripe no configurado' }, { status: 503 });
  }
  const modo = comprobarModoStripe();
  if (!modo.puedeCobrar) return NextResponse.json({ error: modo.motivo }, { status: 503 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede gestionar la suscripción' }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as { plan?: unknown } | null;
  const precioEstudio = priceIdDe('ESTUDIO');
  if (!precioEstudio) return NextResponse.json({ error: 'El plan Estudio no está disponible ahora mismo.' }, { status: 503 });

  const { data: fila, error: eFila } = await admin
    .from('studios').select(`id, cadena_id, subscription_id, ${COLUMNAS_PLAN}`)
    .eq('id', sesion.studioId).maybeSingle();
  if (eFila) return errorInterno('billing/cambiar-plan:leer', eFila, 'No se ha podido comprobar tu plan. Vuelve a intentarlo.');
  if (!fila) return NextResponse.json({ error: 'Estudio no encontrado' }, { status: 404 });
  const studio = { ...planDeFila(fila), cadenaId: fila.cadena_id as string | null, subscriptionId: fila.subscription_id as string | null };
  const motivo = motivoNoCambioPlan(studio, body?.plan);
  if (motivo) return NextResponse.json({ error: MENSAJE_NO_CAMBIO_PLAN[motivo], codigo: motivo }, { status: 409 });

  const claveLock = claveCheckoutLock('studio', fila.id as string);
  if (!(await reclamarCheckoutLock(admin, claveLock))) {
    return NextResponse.json({ error: 'Ya hay un cambio de tu suscripción en marcha. Espera unos segundos.' }, { status: 409 });
  }
  try {
    const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
    const subId = studio.subscriptionId as string;
    const sub = await stripe.subscriptions.retrieve(subId);
    if (sub.status === 'past_due') {
      return NextResponse.json({ error: MENSAJE_NO_CAMBIO_PLAN.impago, codigo: 'impago' }, { status: 409 });
    }
    if (sub.status !== 'active' && sub.status !== 'trialing') {
      return NextResponse.json({ error: MENSAJE_NO_CAMBIO_PLAN['sin-suscripcion'], codigo: 'sin-suscripcion' }, { status: 409 });
    }
    const lineas = sub.items.data;
    const items = itemsParaPasarAEstudio(
      lineas.map((l) => ({ id: l.id, priceId: l.price?.id })),
      precioEstudio,
      { plan: planDePriceId, esAddon: (p) => !!addonDePriceId(p) },
    );
    // La fila decía Founding, pero Stripe no (el webhook va por detrás, o el plan
    // ya se cambió por otra vía): no se toca nada.
    if (!items) {
      return NextResponse.json({ error: 'Tu suscripción ya no es de Founding Studio. Recarga la página.', codigo: 'ya-lo-tiene' }, { status: 409 });
    }

    await stripe.subscriptions.update(
      subId,
      { items, proration_behavior: 'create_prorations', metadata: { plan: 'ESTUDIO' } },
      // Atada a las líneas leídas: un doble clic no aplica dos cambios, y la
      // clave no se reutiliza para otra suscripción con otras líneas.
      { idempotencyKey: `plan-${subId}-ESTUDIO-${lineas.map((l) => l.id).sort().join('.')}` },
    );

    // Lo que hay AHORA en Stripe, no lo que creemos haber hecho.
    const despues = await stripe.subscriptions.retrieve(subId);
    const lectura = lecturaSuscripcion(
      despues.items.data.map((l) => ({ priceId: l.price?.id ?? null })),
      despues.status,
      { plan: planDePriceId, addon: addonDePriceId },
    );
    if (lectura.plan !== 'ESTUDIO' || lectura.addons.length > 0) {
      return NextResponse.json({ error: 'No se ha podido completar el cambio. Vuelve a intentarlo en unos segundos.' }, { status: 409 });
    }
    const { error: eGuardar } = await admin.from('studios').update({ plan: 'ESTUDIO', addons: [] }).eq('id', fila.id);
    if (eGuardar) {
      // Stripe ya cambió (el webhook lo guardará en segundos): éxito, no reintento.
      console.error('[billing/cambiar-plan] guardar', eGuardar.message);
      return NextResponse.json({ ok: true, plan: 'ESTUDIO', pendienteDeGuardar: true });
    }
    return NextResponse.json({ ok: true, plan: 'ESTUDIO' });
  } catch (err) {
    return errorInterno('billing/cambiar-plan:POST', err, 'No se ha podido cambiar de plan. No se te ha cobrado nada; vuelve a intentarlo.');
  } finally {
    await liberarCheckoutLock(admin, claveLock);
  }
}
