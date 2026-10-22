import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { verificarSesionStaff } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { addonDePriceId, planDePriceId, priceIdDeAddon } from '@/lib/billing/billing';
import { comprobarModoStripe } from '@/lib/billing/modo-stripe';
import { lecturaSuscripcion } from '@/lib/billing/lectura-suscripcion';
import { ADDONS, COLUMNAS_PLAN, esAddon, planDeFila } from '@/lib/billing/entitlements';
import { MENSAJE_NO_ADDON, motivoNoAddon } from '@/lib/billing/addons-reglas';
import { claveCheckoutLock, liberarCheckoutLock, reclamarCheckoutLock } from '@/lib/billing/checkout-lock';
import { errorInterno } from '@/lib/errores-servidor';

// Activar o quitar un complemento de Founding Studio (19-oct-2026, decisión del
// fundador; catálogo en lib/billing/entitlements.ts `ADDONS`). Cada complemento
// es una línea más de la MISMA suscripción de Stripe: 29 € + 6 € = 35 €/mes, con
// la parte proporcional del mes en curso en la próxima factura.
//
// Dinero: nada optimista. Se cambia la suscripción en Stripe y, después, se
// vuelve a LEER de Stripe para escribir `studios.addons` con lo que hay de
// verdad (el webhook hará lo mismo con su evento). Solo la propietaria, con el
// mismo cerrojo por estudio que el checkout (no se cruzan dos cambios a la vez)
// y el mismo guardia de modo de Stripe que toda puerta por la que entra dinero.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'billing-addons', { max: 10, windowSeconds: 60 });
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

  const body = await req.json().catch(() => null) as { addon?: unknown; activar?: unknown } | null;
  const addon = body?.addon;
  if (!esAddon(addon) || typeof body?.activar !== 'boolean') {
    return NextResponse.json({ error: 'Complemento no válido' }, { status: 400 });
  }
  const activar = body.activar;
  const price = priceIdDeAddon(addon);
  if (!price) {
    return NextResponse.json({ error: `«${ADDONS[addon].nombre}» todavía no se puede contratar. Escríbenos y lo activamos.` }, { status: 503 });
  }

  const { data: fila, error: eFila } = await admin
    .from('studios').select(`id, cadena_id, subscription_id, ${COLUMNAS_PLAN}`)
    .eq('id', sesion.studioId).maybeSingle();
  if (eFila) return errorInterno('billing/addons:leer', eFila, 'No se ha podido comprobar tu plan. Vuelve a intentarlo.');
  if (!fila) return NextResponse.json({ error: 'Estudio no encontrado' }, { status: 404 });
  const studio = { ...planDeFila(fila), cadenaId: fila.cadena_id as string | null, subscriptionId: fila.subscription_id as string | null };
  const motivo = motivoNoAddon(studio, activar);
  if (motivo) return NextResponse.json({ error: MENSAJE_NO_ADDON[motivo], codigo: motivo }, { status: 409 });

  const claveLock = claveCheckoutLock('studio', fila.id as string);
  if (!(await reclamarCheckoutLock(admin, claveLock))) {
    return NextResponse.json({ error: 'Ya hay un cambio de tu suscripción en marcha. Espera unos segundos.' }, { status: 409 });
  }
  try {
    const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
    const subId = studio.subscriptionId as string;
    const sub = await stripe.subscriptions.retrieve(subId);
    const lineas = sub.items.data;
    const linea = lineas.find((l) => addonDePriceId(l.price?.id) === addon);
    if (activar) {
      // Lo que manda es Stripe, no la fila (que puede ir por detrás del webhook):
      // la suscripción tiene que ser de verdad la de Founding y estar al día.
      if (!lineas.some((l) => planDePriceId(l.price?.id) === 'BASE')) {
        return NextResponse.json({ error: MENSAJE_NO_ADDON['no-hace-falta'], codigo: 'no-hace-falta' }, { status: 409 });
      }
      if (sub.status !== 'active' && sub.status !== 'trialing') {
        return NextResponse.json({ error: MENSAJE_NO_ADDON.impago, codigo: 'impago' }, { status: 409 });
      }
    } else if (sub.status === 'canceled' || sub.status === 'incomplete_expired') {
      // Quitar se deja siempre (también sin línea de Founding: tras un cambio de
      // plan que dejó el complemento cobrando), salvo sobre una suscripción muerta.
      return NextResponse.json({ error: MENSAJE_NO_ADDON['sin-suscripcion'], codigo: 'sin-suscripcion' }, { status: 409 });
    }

    if (activar && !linea) {
      // Sin clave de idempotencia a propósito. Una clave atada a las líneas leídas
      // (o al minuto) repite la MISMA clave en activar → quitar → activar, porque
      // las líneas vuelven a ser las de la primera vez, y Stripe devolvía la
      // respuesta guardada de entonces SIN crear la línea (medido el 20-oct-2026:
      // «No se ha podido aplicar el cambio» durante 24 h). Un doble clic no puede
      // duplicar: el cerrojo de arriba serializa las peticiones y cada una vuelve
      // a leer las líneas antes de crear (`!linea`). Un reintento de red del SDK
      // lleva su propia clave, que Stripe resuelve.
      await stripe.subscriptionItems.create(
        { subscription: subId, price, quantity: 1, proration_behavior: 'create_prorations' },
      );
    } else if (!activar && linea) {
      await stripe.subscriptionItems.del(linea.id, { proration_behavior: 'create_prorations' });
    }

    // Lo que hay AHORA en Stripe, no lo que creemos haber hecho.
    const despues = await stripe.subscriptions.retrieve(subId);
    const { addons } = lecturaSuscripcion(
      despues.items.data.map((l) => ({ priceId: l.price?.id ?? null })),
      despues.status,
      { plan: planDePriceId, addon: addonDePriceId },
    );
    // Si Stripe no quedó como se pidió, se dice: nunca un «hecho» que no lo es.
    if (addons.includes(addon) !== activar) {
      return NextResponse.json({ error: 'No se ha podido aplicar el cambio. Vuelve a intentarlo en unos segundos.', addons }, { status: 409 });
    }
    const { error: eGuardar } = await admin.from('studios').update({ addons }).eq('id', fila.id);
    if (eGuardar) {
      // Stripe ya cambió (el webhook lo guardará en segundos): es un éxito, no un
      // error que invite a reintentar.
      console.error('[billing/addons] guardar', eGuardar.message);
      return NextResponse.json({ ok: true, addons, pendienteDeGuardar: true });
    }
    return NextResponse.json({ ok: true, addons });
  } catch (err) {
    return errorInterno('billing/addons:POST', err, 'No se ha podido cambiar el complemento. No se te ha cobrado nada; vuelve a intentarlo.');
  } finally {
    await liberarCheckoutLock(admin, claveLock);
  }
}
