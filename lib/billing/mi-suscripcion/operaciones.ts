// «Mi suscripción»: lo que hacen las rutas de dinero, SIN Next ni red propia, para probarlo con un
// Stripe de mentira (`node --test`). Las rutas (`app/api/billing/{vista-previa,cambio-periodo,baja}`)
// solo ponen la puerta (sesión, rol, modo de Stripe, cerrojo) y traducen el resultado a HTTP.
//
// Regla de las tres: decide con lo que dice STRIPE (se lee la suscripción, no la fila), y después de
// escribir vuelve a LEERLA para confirmar. Un resultado `ok` solo se da con lo confirmado.
import { addonDePriceId, anualDisponible, complementosALaVenta, intervaloDePrice, planDePriceId, priceIdDe, priceIdDeAddon } from '../billing.ts';
import { itemsParaPasarAEstudio } from '../cambio-plan-reglas.ts';
import type { Plan } from '../entitlements.ts';
import { lecturaSuscripcion } from '../lectura-suscripcion.ts';
import {
  accionesDisponibles, itemsParaPasarAAnual, MENSAJE_SIN_CAMBIOS, resumenDeVistaPrevia, type Acciones, type FacturaPrevia,
} from './reglas.ts';

/** Lo mínimo de una suscripción de Stripe que se lee (los tests construyen esto, no un `Stripe.Subscription`). */
export interface SuscripcionStripe {
  status: string;
  cancel_at_period_end?: boolean | null;
  cancel_at?: number | null;
  current_period_end?: number | null;
  items: { data: Array<{
    id: string;
    quantity?: number | null;
    current_period_end?: number | null;
    price?: { id?: string | null; unit_amount?: number | null; currency?: string | null; recurring?: { interval?: string | null; interval_count?: number | null } | null } | null;
  }> };
}

/** El trozo del SDK que usan estas operaciones. */
export interface StripeMinimo {
  subscriptions: {
    retrieve(id: string): Promise<SuscripcionStripe>;
    update(id: string, params: Record<string, unknown>): Promise<unknown>;
  };
  invoices: { createPreview(params: Record<string, unknown>): Promise<FacturaPrevia> };
}

export function leerSuscripcion(sub: SuscripcionStripe) {
  const lineas = sub.items.data;
  const lectura = lecturaSuscripcion(
    lineas.map((l) => ({ priceId: l.price?.id ?? null })), sub.status, { plan: planDePriceId, addon: addonDePriceId },
  );
  const lineaPlan = lineas.find((l) => planDePriceId(l.price?.id)) ?? lineas[0];
  const finUnix = sub.current_period_end ?? lineas[0]?.current_period_end ?? null;
  const bajaProgramada = Boolean(sub.cancel_at_period_end || sub.cancel_at);
  return {
    plan: lectura.plan as Plan | null,
    addons: lectura.addons,
    intervalo: intervaloDePrice(lineaPlan?.price?.recurring),
    estado: sub.status,
    bajaProgramada,
    /** Cuándo se acaba el acceso pagado si hay baja: `cancel_at` si está puesto, si no el fin del periodo. */
    bajaEl: bajaProgramada ? (sub.cancel_at ?? finUnix) : null,
    finPeriodoUnix: finUnix,
    importePeriodoCents: lineas.reduce((t, l) => t + (l.price?.unit_amount ?? 0) * (l.quantity ?? 1), 0),
    moneda: (lineas[0]?.price?.currency ?? 'eur').toLowerCase(),
  };
}

export function accionesDe(lectura: ReturnType<typeof leerSuscripcion>, esCadena: boolean): Acciones {
  return accionesDisponibles({
    estado: lectura.estado, plan: lectura.plan, intervalo: lectura.intervalo, bajaProgramada: lectura.bajaProgramada,
    esCadena, tieneComplementos: lectura.addons.length > 0,
    anualDisponible: anualDisponible() && (lectura.addons.length === 0 || complementosALaVenta('anual')),
  });
}

export const isoDe = (unix: number | null | undefined): string | null => (unix ? new Date(unix * 1000).toISOString() : null);

/** Lo que la ruta devuelve: el estado HTTP y el cuerpo. Un error inesperado se LANZA (lo registra la ruta). */
export interface Resultado { status: number; body: Record<string, unknown> }

const respuesta = (status: number, body: Record<string, unknown>): Resultado => ({ status, body });

const mapaAnual = {
  plan: planDePriceId, addon: addonDePriceId,
  precioAnualPlan: (p: Plan) => priceIdDe(p, 'anual'),
  precioAnualAddon: (a: Parameters<typeof priceIdDeAddon>[0]) => priceIdDeAddon(a, 'anual'),
};

const SIN_ITEMS = 'Tu suscripción tiene algo que no esperábamos. Escríbenos y te cambiamos de plan a mano.';
const SIN_CONFIRMAR = 'No se ha podido completar el cambio. Revisa tu suscripción en unos segundos.';

/** «Qué voy a pagar y cuándo»: la factura previa de Stripe. No escribe ni cobra nada. */
export async function vistaPrevia(
  stripe: StripeMinimo,
  e: { subscriptionId: string; customerId: string; esCadena: boolean; cambio: 'anual' | 'estudio' },
): Promise<Resultado> {
  const sub = await stripe.subscriptions.retrieve(e.subscriptionId);
  const lectura = leerSuscripcion(sub);
  const acciones = accionesDe(lectura, e.esCadena);
  if (acciones.motivoSinCambios && acciones.motivoSinCambios !== 'anual-no-disponible') {
    return respuesta(409, { error: MENSAJE_SIN_CAMBIOS[acciones.motivoSinCambios], codigo: acciones.motivoSinCambios });
  }
  const lineas = sub.items.data.map((l) => ({ id: l.id, priceId: l.price?.id }));

  let items;
  if (e.cambio === 'anual') {
    if (!acciones.cambiarAAnual) return respuesta(409, { error: 'No se puede pasar a anual ahora mismo.' });
    items = itemsParaPasarAAnual(lineas, mapaAnual);
  } else {
    if (!acciones.pasarAEstudio) return respuesta(409, { error: 'No se puede pasar a Estudio ahora mismo.' });
    const precioEstudio = priceIdDe('ESTUDIO', lectura.intervalo);
    items = precioEstudio ? itemsParaPasarAEstudio(lineas, precioEstudio, { plan: planDePriceId, esAddon: (p) => !!addonDePriceId(p) }) : null;
  }
  if (!items) return respuesta(409, { error: SIN_ITEMS, codigo: 'revisar' });

  const previa = await stripe.invoices.createPreview({
    customer: e.customerId,
    subscription: e.subscriptionId,
    subscription_details: { items, proration_behavior: 'create_prorations' },
  });
  return respuesta(200, { ...resumenDeVistaPrevia(previa, e.cambio === 'anual' ? 'ahora' : 'proxima_factura', isoDe(lectura.finPeriodoUnix)) });
}

/** Mensual → anual, al momento y con el crédito del tiempo no usado. Si el cobro no sale, no se cambia nada. */
export async function cambiarAAnual(
  stripe: StripeMinimo, e: { subscriptionId: string; esCadena: boolean },
): Promise<Resultado> {
  try {
    const sub = await stripe.subscriptions.retrieve(e.subscriptionId);
    const acciones = accionesDe(leerSuscripcion(sub), e.esCadena);
    if (!acciones.cambiarAAnual) {
      const motivo = acciones.motivoSinCambios;
      return respuesta(409, { error: motivo ? MENSAJE_SIN_CAMBIOS[motivo] : 'Tu suscripción ya se paga por años.', codigo: motivo ?? 'ya-lo-tiene' });
    }
    const items = itemsParaPasarAAnual(sub.items.data.map((l) => ({ id: l.id, priceId: l.price?.id })), mapaAnual);
    if (!items) return respuesta(409, { error: SIN_ITEMS, codigo: 'revisar' });

    await stripe.subscriptions.update(e.subscriptionId, {
      items, proration_behavior: 'create_prorations', payment_behavior: 'error_if_incomplete',
    });

    // Lo que hay AHORA en Stripe, no lo que creemos haber hecho.
    const despues = leerSuscripcion(await stripe.subscriptions.retrieve(e.subscriptionId));
    if (despues.intervalo !== 'anual' || (despues.estado !== 'active' && despues.estado !== 'trialing')) {
      return respuesta(409, { error: SIN_CONFIRMAR });
    }
    return respuesta(200, { ok: true, intervalo: 'anual' });
  } catch (err) {
    // Un cobro rechazado llega aquí (`error_if_incomplete`): el cambio no se ha aplicado.
    const rechazo = (err as { type?: string; code?: string }) ?? {};
    if (rechazo.type === 'StripeCardError' || rechazo.code === 'payment_intent_payment_attempt_failed' || rechazo.code === 'subscription_payment_intent_requires_action') {
      return respuesta(402, { error: 'No hemos podido cobrar el año por adelantado, así que no se ha cambiado nada. Actualiza la tarjeta e inténtalo de nuevo.', codigo: 'cobro-rechazado' });
    }
    throw err;
  }
}

/** Programar la baja al final del periodo pagado, o quitarla. Sin cobro: el acceso no se recorta antes. */
export async function cambiarBaja(
  stripe: StripeMinimo, e: { subscriptionId: string; esCadena: boolean; accion: 'programar' | 'reactivar'; motivo?: string },
): Promise<Resultado> {
  const sub = await stripe.subscriptions.retrieve(e.subscriptionId);
  const acciones = accionesDe(leerSuscripcion(sub), e.esCadena);
  if (e.accion === 'programar' && !acciones.cancelar) {
    return respuesta(409, { error: e.esCadena ? 'Tu sede va con el plan Cadena: la baja se gestiona desde la sede principal.' : 'Tu suscripción ya tiene la baja programada o no está activa.', codigo: 'no-aplica' });
  }
  if (e.accion === 'reactivar' && !acciones.reactivar) {
    return respuesta(409, { error: 'Tu suscripción no tiene ninguna baja programada.', codigo: 'no-aplica' });
  }

  await stripe.subscriptions.update(
    e.subscriptionId,
    e.accion === 'programar'
      ? { cancel_at_period_end: true, ...(e.motivo ? { cancellation_details: { comment: e.motivo } } : {}) }
      // `cancel_at: ''` borra una baja puesta con fecha concreta (desde el portal o el dashboard).
      : { cancel_at_period_end: false, ...(sub.cancel_at ? { cancel_at: '' } : {}) },
  );

  const despues = leerSuscripcion(await stripe.subscriptions.retrieve(e.subscriptionId));
  if (despues.bajaProgramada !== (e.accion === 'programar')) return respuesta(409, { error: SIN_CONFIRMAR });
  return respuesta(200, { ok: true, bajaProgramada: despues.bajaProgramada, accesoHasta: isoDe(despues.bajaEl) });
}
