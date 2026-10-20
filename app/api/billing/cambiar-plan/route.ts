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
    // Con la baja programada, la diferencia del prorrateo iría a una factura que
    // nunca llega. No se quita la baja en silencio: que la reactive ella.
    if (sub.cancel_at_period_end || sub.cancel_at) {
      return NextResponse.json({ error: MENSAJE_NO_CAMBIO_PLAN['baja-programada'], codigo: 'baja-programada' }, { status: 409 });
    }
    const lineas = sub.items.data;
    const leidas = lineas.map((l) => ({ id: l.id, priceId: l.price?.id }));
    const items = itemsParaPasarAEstudio(leidas, precioEstudio, { plan: planDePriceId, esAddon: (p) => !!addonDePriceId(p) });
    if (!items) {
      // Stripe ya no dice Founding (el webhook va por detrás, o se cambió por otra
      // vía), o hay una línea que no es nuestra: no se toca nada.
      const yaNoEsFounding = !lineas.some((l) => planDePriceId(l.price?.id) === 'BASE');
      return yaNoEsFounding
        ? NextResponse.json({ error: 'Tu suscripción ya no es de Founding Studio. Recarga la página.', codigo: 'ya-lo-tiene' }, { status: 409 })
        : NextResponse.json({ error: MENSAJE_NO_CAMBIO_PLAN.revisar, codigo: 'revisar' }, { status: 409 });
    }
    // Mismo intervalo que el plan de ahora: si no, Stripe facturaría y cobraría en
    // el acto, y un rechazo dejaría la suscripción en impago con un «hecho» aquí.
    const lineaPlan = lineas.find((l) => planDePriceId(l.price?.id) === 'BASE');
    const estudio = await stripe.prices.retrieve(precioEstudio);
    if (lineaPlan?.price?.recurring?.interval !== estudio.recurring?.interval
      || (lineaPlan?.price?.recurring?.interval_count ?? 1) !== (estudio.recurring?.interval_count ?? 1)) {
      return NextResponse.json({ error: MENSAJE_NO_CAMBIO_PLAN.revisar, codigo: 'revisar' }, { status: 409 });
    }

    // Sin clave de idempotencia propia (mismo motivo que /api/billing/addons: una
    // clave atada a las líneas leídas se repite si la suscripción vuelve a esa
    // forma, p. ej. Estudio → Founding por el portal, y Stripe devuelve la
    // respuesta vieja sin aplicar nada). Un doble clic no aplica dos cambios: el
    // cerrojo serializa y, tras el primero, ya no hay línea de Founding
    // (`itemsParaPasarAEstudio` → 409). Un reintento de red del SDK lleva su clave.
    await stripe.subscriptions.update(
      subId,
      { items, proration_behavior: 'create_prorations', metadata: { plan: 'ESTUDIO' } },
    );

    // Lo que hay AHORA en Stripe, no lo que creemos haber hecho.
    const despues = await stripe.subscriptions.retrieve(subId);
    const lectura = lecturaSuscripcion(
      despues.items.data.map((l) => ({ priceId: l.price?.id ?? null })),
      despues.status,
      { plan: planDePriceId, addon: addonDePriceId },
    );
    if (lectura.plan !== 'ESTUDIO' || lectura.addons.length > 0 || (despues.status !== 'active' && despues.status !== 'trialing')) {
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
    return errorInterno('billing/cambiar-plan:POST', err, 'No se ha podido confirmar el cambio de plan. Recarga la página en unos segundos para ver cómo ha quedado.');
  } finally {
    await liberarCheckoutLock(admin, claveLock);
  }
}
