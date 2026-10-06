// ─────────────────────────────────────────────────────────────────────────────
// Guardar en la ficha la tarjeta que la alumna autorizó en un Checkout `mode:
// 'setup'` (`purpose: 'tarjeta'`): el enlace que manda el panel y «Cambiar /
// Añadir tarjeta» de la app (6-oct-2026).
//
// UN dueño para los dos que lo escriben:
//   · el webhook (`checkout.session.completed`), lo normal;
//   · la confirmación que la app pregunta tras el formulario
//     (`GET /api/public/tarjeta?sesion=`), por si el webhook no llegó a escribir:
//     contesta 200 antes de procesar (`after()`), Stripe no reintenta, y el
//     conciliador solo mira cobros. Sin esto, la tarjeta quedaba en Stripe y no
//     en la ficha para siempre.
//
// Lo que no puede pasar, y cómo se evita:
//   · Volver a una tarjeta ANTERIOR (dos sesiones casi a la vez, o un evento viejo
//     reenviado): la que ya está en la ficha gana si es MÁS NUEVA (`created`) y
//     sigue en su Customer.
//   · Apuntar la ficha a una tarjeta ya soltada: el método tiene que seguir en el
//     Customer de la sesión (uno soltado no tiene Customer).
//   · Pisar a ciegas: compare-and-set contra lo leído; si cambió, se vuelve a
//     decidir con lo nuevo (una vez) y si sigue cambiando, no se escribe.
//   · Soltar en Stripe algo en uso: solo la sustituida, y solo si era SOLO de
//     cobros (`debeSoltarTarjetaSustituida`).
//
// Sin alias `@/`: lo prueba `node --test`.
// ─────────────────────────────────────────────────────────────────────────────
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { caducidadDe } from './caducidad-tarjeta.ts';
import { debeSoltarTarjetaSustituida, filaTarjetaDeCobros, tarjetaEsSuya } from './tarjetas-guardadas.ts';

type ConCustomer = { customer?: string | { id?: string } | null };

export type DecisionGuardado =
  | { tipo: 'YA_ESTA' }
  | { tipo: 'DESCARTAR'; motivo: 'NO_ES_DE_SU_CUSTOMER' | 'MAS_ANTIGUA' }
  | { tipo: 'ESCRIBIR'; soltarSustituida: boolean };

/** Puro: ¿se escribe esta tarjeta en la ficha, y se suelta la que había? */
export function decidirGuardadoDeTarjeta(p: {
  nueva: { id: string; created: number } & ConCustomer;
  customerDeLaSesion: string | null;
  anterior: string | null;
  /** La de la ficha, leída de Stripe. `null` = no hay, o ya no existe. */
  pmAnterior: ({ created?: number | null; type?: string | null; allow_redisplay?: string | null } & ConCustomer) | null;
  sepaDeLaFicha: string | null;
  customerDeLaFicha: string | null;
}): DecisionGuardado {
  if (!tarjetaEsSuya(p.nueva.customer, p.customerDeLaSesion)) return { tipo: 'DESCARTAR', motivo: 'NO_ES_DE_SU_CUSTOMER' };
  if (p.anterior === p.nueva.id) return { tipo: 'YA_ESTA' };
  const anteriorViva = !!p.pmAnterior && tarjetaEsSuya(p.pmAnterior.customer, p.customerDeLaFicha ?? p.customerDeLaSesion);
  if (anteriorViva && typeof p.pmAnterior?.created === 'number' && p.pmAnterior.created > p.nueva.created) {
    return { tipo: 'DESCARTAR', motivo: 'MAS_ANTIGUA' };
  }
  return {
    tipo: 'ESCRIBIR',
    soltarSustituida: debeSoltarTarjetaSustituida({
      sustituida: p.anterior, nueva: p.nueva.id, sepaDeLaFicha: p.sepaDeLaFicha,
      customerDeLaFicha: p.customerDeLaFicha ?? p.customerDeLaSesion, pmSustituido: p.pmAnterior,
    }),
  };
}

export type ResultadoGuardado =
  | { tipo: 'ESCRITA'; soltada: boolean }
  | { tipo: 'YA_ESTA' }
  | { tipo: 'DESCARTADA'; motivo: 'NO_ES_DE_SU_CUSTOMER' | 'MAS_ANTIGUA' | 'NO_ES_TARJETA' | 'SIN_METODO' }
  | { tipo: 'SIN_FICHA' }
  /** La ficha cambió dos veces mientras se decidía: no se escribe (otro lo está haciendo). */
  | { tipo: 'CAMBIO_CONCURRENTE' };

const esNoExiste = (e: unknown) => (e as { code?: string } | null)?.code === 'resource_missing';

/**
 * Escribe en la ficha la tarjeta del SetupIntent de una sesión ya completada. Lanza
 * si la base de datos o Stripe fallan (quien llama decide: el webhook avisa, la app
 * sigue preguntando).
 */
export async function guardarTarjetaDeSesion(
  admin: SupabaseClient,
  stripe: Stripe,
  p: {
    socioId: string;
    studioId: string;
    stripeAccount: string | null;
    customerDeLaSesion: string | null;
    /** El método del SetupIntent: expandido o su id. */
    metodo: Stripe.PaymentMethod | string | null;
  },
): Promise<ResultadoGuardado> {
  const cuenta = p.stripeAccount ? { stripeAccount: p.stripeAccount } : undefined;
  if (!p.metodo) return { tipo: 'DESCARTADA', motivo: 'SIN_METODO' };
  const nueva = typeof p.metodo === 'string' ? await stripe.paymentMethods.retrieve(p.metodo, {}, cuenta) : p.metodo;
  if (nueva.type !== 'card') return { tipo: 'DESCARTADA', motivo: 'NO_ES_TARJETA' };

  for (let vuelta = 0; vuelta < 2; vuelta++) {
    const { data: ficha, error: errFicha } = await admin.from('socios')
      .select('stripe_payment_method_id, sepa_payment_method_id, stripe_customer_id')
      .eq('id', p.socioId).eq('studio_id', p.studioId).maybeSingle();
    if (errFicha) throw new Error(errFicha.message);
    if (!ficha) return { tipo: 'SIN_FICHA' };
    const anterior = (ficha.stripe_payment_method_id as string | null) ?? null;
    let pmAnterior: Stripe.PaymentMethod | null = null;
    if (anterior && anterior !== nueva.id) {
      try {
        pmAnterior = await stripe.paymentMethods.retrieve(anterior, {}, cuenta);
      } catch (e) {
        if (!esNoExiste(e)) throw e;
      }
    }
    const decision = decidirGuardadoDeTarjeta({
      nueva, customerDeLaSesion: p.customerDeLaSesion, anterior, pmAnterior,
      sepaDeLaFicha: (ficha.sepa_payment_method_id as string | null) ?? null,
      customerDeLaFicha: (ficha.stripe_customer_id as string | null) ?? null,
    });
    if (decision.tipo === 'YA_ESTA') return decision;
    if (decision.tipo === 'DESCARTAR') return { tipo: 'DESCARTADA', motivo: decision.motivo };

    // El método y su marca, últimos cuatro y caducidad en el MISMO update: al cambiar
    // de tarjeta, la ficha nunca enseña los dígitos de la vieja con el método de la nueva.
    let q = admin.from('socios')
      .update(filaTarjetaDeCobros(nueva.id, caducidadDe(nueva), p.customerDeLaSesion))
      .eq('id', p.socioId).eq('studio_id', p.studioId);
    q = anterior === null ? q.is('stripe_payment_method_id', null) : q.eq('stripe_payment_method_id', anterior);
    const { data: tocadas, error } = await q.select('id');
    if (error) throw new Error(error.message);
    if ((tocadas?.length ?? 0) === 0) continue; // cambió entre medias: se decide otra vez con lo nuevo

    // Best-effort: lo que importa (cobrar con la nueva) ya está escrito.
    let soltada = false;
    if (decision.soltarSustituida && anterior) {
      try {
        await stripe.paymentMethods.detach(anterior, {}, cuenta);
        soltada = true;
      } catch (e) {
        if (!esNoExiste(e)) console.error('[guardar-tarjeta-de-sesion] no se pudo soltar la sustituida', e);
      }
    }
    return { tipo: 'ESCRITA', soltada };
  }
  return { tipo: 'CAMBIO_CONCURRENTE' };
}
