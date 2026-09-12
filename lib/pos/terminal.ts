import 'server-only';
import Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MetodoPago } from '@/lib/types';
import { applicationFeeAmount } from '@/lib/billing/stripe-fees';
import { comprobarModoStripe } from '@/lib/billing/modo-stripe';
import { bizumActivo } from '@/lib/billing/bizum-activo';
import { metodoRealBizum } from './metodo-real-bizum.ts';
import type { EstadoPagoPOS } from './tipos.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Proveedores de cobro del TPV.
//
// El POS no habla con Stripe: habla con un `ProveedorTerminal`. Hay tres, y la
// diferencia entre ellos NO es de implementación, es de quién tiene la última
// palabra sobre si el dinero entró:
//
//   · `datafono`  — Stripe Terminal, lector físico (card_present). Lo confirma
//                   Stripe. Es la integración REAL que ya existía en
//                   /api/terminal/cobrar; aquí solo se le pone un contrato
//                   delante para que el POS no dependa de ella directamente.
//   · `bizum`     — Stripe Checkout con `payment_method_types: ['bizum']`. Lo
//                   confirma Stripe.
//   · `manual`    — efectivo, transferencia, y el datáfono NO integrado (el
//                   estudio cobra en su TPV externo del banco). Aquí no hay
//                   tercero a quien preguntar: la confirmación es la palabra de
//                   quien está cobrando, y eso está BIEN siempre que el sistema
//                   no finja que la comprobó.
//
// ⚠️ Esa última frase es el bug que este módulo existe para no repetir. El TPV
// anterior tenía un botón «Cobro realizado» en Bizum que llamaba a
// `finalizarVenta()` sin preguntarle nada a Stripe, y un fallback que
// registraba la venta como cobrada cuando el checkout ni siquiera respondía.
// Un pago por móvil NO es un billete de 50 €: uno se ve, el otro hay que
// comprobarlo. `esAutoritativo` es lo que separa los dos casos, y ninguna
// pantalla puede saltárselo.
//
// ─── Añadir un proveedor nuevo (otro banco, otro TPV) ──────────────────────
// Implementar `ProveedorTerminal` y registrarlo en `proveedorPara()`. Nada más
// del POS cambia: la ruta de venta, la de confirmación y el webhook trabajan
// contra el contrato, no contra Stripe.
// ─────────────────────────────────────────────────────────────────────────────

export interface ContextoCobro {
  stripe: Stripe;
  /** Cuenta Connect del estudio. El dinero es suyo, no de la plataforma. */
  stripeAccount: string;
  studioId: string;
  esTest: boolean;
}

/**
 * QUÉ se está cobrando. Viaja en la metadata del PaymentIntent para que el
 * webhook sepa qué cerrar aunque el navegador del mostrador muera a mitad.
 *
 * Son dos cosas distintas y no se pueden mezclar: una VENTA del TPV (que hay
 * que confirmar y entregar) y un RECIBO ya existente (una cuota que la socia
 * viene a pagar). El tipo lo hace excluyente para que no se pueda mandar las
 * dos ni ninguna.
 */
export type ReferenciaCobro =
  | { ventaId: string; reciboId?: never }
  | { reciboId: string; ventaId?: never };

export function metadataDe(ref: ReferenciaCobro): Record<string, string> {
  return ref.ventaId ? { ventaId: ref.ventaId } : { reciboId: ref.reciboId! };
}

export interface PeticionCobro {
  /** En céntimos, calculado EN SERVIDOR a partir de la venta o el recibo. */
  importeCentimos: number;
  concepto: string;
  ref: ReferenciaCobro;
}

export type ResultadoInicio =
  | {
      ok: true; referencia: string; url?: string | null; estado: EstadoPagoPOS;
      /**
       * Solo Bizum: la Checkout Session que envuelve el PaymentIntent de
       * `referencia`. Hace falta para poder cancelar de verdad (ver
       * `cancelar` más abajo) — cancelar el PaymentIntent a secas no invalida
       * el enlace de pago de una Checkout Session (P-1, 27ª pasada).
       */
      checkoutSessionId?: string;
    }
  | { ok: false; error: string };

export interface ProveedorTerminal {
  readonly id: 'datafono' | 'bizum' | 'manual';
  readonly nombre: string;
  /**
   * ¿La respuesta de este proveedor es la fuente de verdad del pago?
   * `false` = lo confirma la persona que cobra (efectivo y equivalentes).
   */
  readonly esAutoritativo: boolean;
  iniciar(ctx: ContextoCobro, p: PeticionCobro): Promise<ResultadoInicio>;
  /**
   * `importeCentimos` = lo que el proveedor dice haber cobrado, para poder
   * contrastarlo con el total de la venta. `null` si no lo sabe todavía.
   *
   * `metadata` = la que ESTE servidor puso al crear el cobro. Es lo único que
   * demuestra que un PaymentIntent pertenece a la venta o al recibo que se
   * está cerrando: la referencia se guarda en una columna que el cliente puede
   * escribir (`recibos` tiene GRANT de UPDATE a `authenticated`, y un REVOKE
   * por columna no resta de un grant de tabla). Sin comprobarla, se podría
   * apuntar un recibo al PaymentIntent que ya pagó OTRO del mismo importe y
   * cobrar dos veces con un solo pago.
   *
   * `metodoReal` = con qué medio se pagó DE VERDAD, cuando el proveedor puede
   * mentir sobre eso (Bizum: la sesión también acepta tarjeta, #1744).
   * `undefined` cuando el proveedor no tiene ambigüedad que resolver
   * (datáfono siempre es tarjeta; manual no lo sabe nadie más que quien
   * cobra). Quien llama debe usarlo por encima del método que él mismo pidió
   * (P-3, 27ª/28ª pasada) — nunca al revés.
   */
  consultar(ctx: ContextoCobro, referencia: string): Promise<{ estado: EstadoPagoPOS; error?: string; importeCentimos?: number | null; metadata?: Record<string, string>; metodoReal?: 'BIZUM' | 'TARJETA' }>;
  /**
   * `checkoutSessionId`: solo lo usa Bizum (ver ResultadoInicio). Con él,
   * cancelar expira la Checkout Session en vez de solo el PaymentIntent — eso
   * es lo que de verdad invalida el enlace de pago. Sin él (ventas creadas
   * antes de esta columna, o proveedores que no la usan), cae al
   * comportamiento anterior.
   */
  cancelar(ctx: ContextoCobro, referencia: string, checkoutSessionId?: string | null): Promise<void>;
}

// ─── Traducción de los estados de Stripe a los del POS ───────────────────────
// Se traduce en un solo sitio, y a un vocabulario nuestro: `requires_action` no
// significa nada en un mostrador. El default es ERROR, nunca PAGADO — un estado
// que no reconocemos jamás puede leerse como "cobrado".
function estadoDesdeStripe(status: Stripe.PaymentIntent.Status): EstadoPagoPOS {
  switch (status) {
    case 'succeeded':                return 'PAGADO';
    case 'processing':               return 'PROCESANDO';
    case 'requires_payment_method':  return 'PENDIENTE';
    case 'requires_confirmation':
    case 'requires_action':
    case 'requires_capture':         return 'PROCESANDO';
    case 'canceled':                 return 'CANCELADO';
    default:                         return 'ERROR';
  }
}

// ─── Datáfono (Stripe Terminal) ──────────────────────────────────────────────

function crearProveedorDatafono(readerId: string | null): ProveedorTerminal {
  return {
    id: 'datafono',
    nombre: 'Datáfono',
    esAutoritativo: true,

    async iniciar(ctx, p) {
      if (!readerId) {
        return { ok: false, error: 'No hay datáfono emparejado. Configúralo en Ajustes del TPV.' };
      }
      try {
        const pi = await ctx.stripe.paymentIntents.create({
          amount: p.importeCentimos,
          currency: 'eur',
          payment_method_types: ['card_present'],
          capture_method: 'automatic',
          // La referencia es lo que permite que el webhook cierre la venta —o
          // el recibo— aunque el navegador del mostrador se cierre a mitad del
          // cobro. Sin esto haría falta el rodeo del backstop de
          // reconciliación, que no sabe a qué apuntar.
          metadata: { studioId: ctx.studioId, origen: 'pos_terminal', ...metadataDe(p.ref), concepto: p.concepto },
          ...(applicationFeeAmount(p.importeCentimos) !== undefined
            ? { application_fee_amount: applicationFeeAmount(p.importeCentimos) }
            : {}),
        }, { stripeAccount: ctx.stripeAccount });

        await ctx.stripe.terminal.readers.processPaymentIntent(
          readerId, { payment_intent: pi.id }, { stripeAccount: ctx.stripeAccount },
        );
        // Solo en test: simula que alguien acerca la tarjeta, para poder probar
        // el flujo entero sin hardware.
        if (ctx.esTest) {
          await ctx.stripe.testHelpers.terminal.readers.presentPaymentMethod(
            readerId, {}, { stripeAccount: ctx.stripeAccount },
          );
        }
        return { ok: true, referencia: pi.id, estado: 'PROCESANDO' };
      } catch (err) {
        console.error('[pos/terminal:datafono]', err instanceof Stripe.errors.StripeError ? err.message : err);
        return { ok: false, error: 'No se pudo enviar el importe al datáfono.' };
      }
    },

    async consultar(ctx, referencia) {
      try {
        const pi = await ctx.stripe.paymentIntents.retrieve(referencia, {}, { stripeAccount: ctx.stripeAccount });
        return {
          estado: estadoDesdeStripe(pi.status),
          error: pi.last_payment_error?.message ?? undefined,
          importeCentimos: pi.amount_received ?? null,
          metadata: (pi.metadata ?? {}) as Record<string, string>,
        };
      } catch (err) {
        console.error('[pos/terminal:datafono:consultar]', err instanceof Stripe.errors.StripeError ? err.message : err);
        // No se pudo PREGUNTAR. Eso no es "no pagado": es "no lo sé". Se
        // devuelve PROCESANDO para que quien espera siga esperando en vez de
        // dar el cobro por fallido y arriesgarse a cobrar dos veces.
        return { estado: 'PROCESANDO' };
      }
    },

    async cancelar(ctx, referencia) {
      try {
        if (readerId) {
          // `{}` de parámetros y la cuenta Connect en el TERCER argumento: es
          // la posición de las opciones de petición. Pasarla como segundo
          // argumento la mandaría en el cuerpo y el cobro se cancelaría (o no)
          // en la cuenta de la plataforma, no en la del estudio.
          await ctx.stripe.terminal.readers.cancelAction(readerId, {}, { stripeAccount: ctx.stripeAccount });
        }
        await ctx.stripe.paymentIntents.cancel(referencia, {}, { stripeAccount: ctx.stripeAccount });
      } catch (err) {
        // Cancelar es best-effort: si el PaymentIntent ya no admite cancelación
        // (porque acaba de cobrarse), lo correcto es NO tocarlo. El estado real
        // lo dirá la siguiente consulta.
        console.error('[pos/terminal:datafono:cancelar]', err instanceof Stripe.errors.StripeError ? err.message : err);
      }
    },
  };
}

// ─── Bizum (Checkout hosted) ─────────────────────────────────────────────────

function crearProveedorBizum(origen: string): ProveedorTerminal {
  return {
    id: 'bizum',
    nombre: 'Bizum',
    esAutoritativo: true,

    async iniciar(ctx, p) {
      try {
        // Comprobar la capacidad ANTES de llamar a Stripe: pedir `bizum` sin
        // que esté `active` en la cuenta conectada tumba el `create` ENTERO
        // (también la tarjeta que va en la misma llamada), no solo Bizum.
        // Visto en producción (2026-09-12): el mostrador se quedaba sin poder
        // cobrar nada por este método. Ver lib/billing/bizum-activo.ts.
        if (!(await bizumActivo(ctx.stripe, ctx.stripeAccount))) {
          return {
            ok: false,
            error: 'Bizum no está activo todavía en la cuenta de Stripe de este estudio. Actívalo en tu Dashboard de Stripe (Configuración → Métodos de pago) o completa los datos fiscales pendientes.',
          };
        }
        const sesion = await ctx.stripe.checkout.sessions.create({
          mode: 'payment',
          // ⚠️ `['card', 'bizum']`, NO `['bizum']` a secas. El checkout del
          // portal —el único camino de Bizum que se sabe que FUNCIONA en
          // producción— lo pide así (`app/api/stripe/checkout/route.ts`), y el
          // TPV lo pedía solo con Bizum: Stripe rechazaba crear la sesión y en
          // el mostrador salía «No se pudo generar el cobro por Bizum».
          //
          // Para un mostrador además es mejor: la clienta abre el enlace en su
          // móvil y paga por Bizum o con tarjeta, lo que tenga a mano. El
          // método REAL que use lo resuelve el webhook al confirmar.
          payment_method_types: ['card', 'bizum'],
          line_items: [{
            quantity: 1,
            price_data: {
              currency: 'eur',
              unit_amount: p.importeCentimos,
              product_data: { name: p.concepto.slice(0, 120) || 'Venta' },
            },
          }],
          payment_intent_data: {
            metadata: { studioId: ctx.studioId, origen: 'pos_bizum', ...metadataDe(p.ref) },
            ...(applicationFeeAmount(p.importeCentimos) !== undefined
              ? { application_fee_amount: applicationFeeAmount(p.importeCentimos) }
              : {}),
          },
          metadata: { studioId: ctx.studioId, origen: 'pos_bizum', ...metadataDe(p.ref) },
          success_url: `${origen}/pos?bizum=ok`,
          cancel_url: `${origen}/pos?bizum=cancelado`,
          // P-1 (27ª pasada): cota el enlace aunque nadie pulse "Cancelar" en
          // el mostrador. 30 min es el mínimo que admite Stripe — de sobra
          // para un cobro de mostrador, y muy por debajo de las 24h que
          // duraba antes (el QR "seguía válido" al día siguiente).
          expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
        }, { stripeAccount: ctx.stripeAccount });

        if (!sesion.url) return { ok: false, error: 'Stripe no devolvió el enlace de pago.' };
        // La referencia es el PaymentIntent, no la sesión: es lo que confirma
        // el webhook y lo que se puede reembolsar después.
        const pi = typeof sesion.payment_intent === 'string'
          ? sesion.payment_intent
          : sesion.payment_intent?.id ?? sesion.id;
        // P-1 (27ª pasada): la sesión SÍ se guarda ahora — hace falta para
        // poder expirarla de verdad al cancelar (ver `cancelar`, más abajo).
        return { ok: true, referencia: pi, url: sesion.url, estado: 'PENDIENTE', checkoutSessionId: sesion.id };
      } catch (err) {
        console.error('[pos/terminal:bizum]', err instanceof Stripe.errors.StripeError ? err.message : err);
        // ⚠️ El motivo REAL, no un genérico. «No se pudo generar el cobro por
        // Bizum» dejaba a quien cobra sin nada que hacer: la causa casi
        // siempre es de configuración —Bizum sin activar en la cuenta de
        // Stripe, o la cuenta sin terminar de verificar— y eso se arregla en
        // dos minutos SI alguien te lo dice. El mensaje de Stripe es
        // descriptivo y no expone secretos.
        if (err instanceof Stripe.errors.StripeError) {
          return { ok: false, error: `Stripe no ha aceptado el cobro por Bizum: ${err.message}` };
        }
        return { ok: false, error: 'No se pudo generar el cobro por Bizum.' };
      }
    },

    async consultar(ctx, referencia) {
      try {
        const pi = await ctx.stripe.paymentIntents.retrieve(referencia, {}, { stripeAccount: ctx.stripeAccount });
        return {
          estado: estadoDesdeStripe(pi.status),
          error: pi.last_payment_error?.message ?? undefined,
          importeCentimos: pi.amount_received ?? null,
          metadata: (pi.metadata ?? {}) as Record<string, string>,
          // Solo hace falta mirar el cargo real si de verdad se cobró: pedir
          // el cargo de un PI pendiente no tiene nada que resolver todavía.
          metodoReal: pi.status === 'succeeded' ? await metodoRealBizum(ctx.stripe, pi, ctx.stripeAccount) : undefined,
        };
      } catch {
        return { estado: 'PROCESANDO' };
      }
    },

    async cancelar(ctx, referencia, checkoutSessionId) {
      // P-1 (27ª pasada): cancelar el PaymentIntent a secas NO invalida el
      // enlace de pago de una Checkout Session — Stripe no permite
      // cancelarlo directamente mientras la sesión sigue abierta (el intento
      // falla en silencio, capturado por el catch de abajo), así que la
      // clienta podía seguir pagando el QR después de que el mostrador diera
      // la venta por cancelada y la cobrara en efectivo: doble cobro real.
      // `sessions.expire` es lo que de verdad cierra la puerta — y cancela el
      // PaymentIntent asociado como parte del mismo efecto.
      if (checkoutSessionId) {
        try {
          await ctx.stripe.checkout.sessions.expire(checkoutSessionId, undefined, { stripeAccount: ctx.stripeAccount });
          return;
        } catch (err) {
          // Sesión ya expirada/completada, o ya no existe: no es un error que
          // bloquee la cancelación en el mostrador. Cae al intento de cancelar
          // el PI por si acaso (best-effort, igual que antes).
          console.error('[pos/terminal:bizum:cancelar]', err instanceof Stripe.errors.StripeError ? err.message : err);
        }
      }
      // Ventas de antes de esta columna (sin checkoutSessionId guardado): se
      // mantiene el comportamiento anterior en vez de dejarlas sin ningún
      // intento de cancelación.
      try {
        await ctx.stripe.paymentIntents.cancel(referencia, {}, { stripeAccount: ctx.stripeAccount });
      } catch { /* best-effort, ver datáfono */ }
    },
  };
}

// ─── Manual (efectivo, transferencia, TPV del banco) ─────────────────────────

const PROVEEDOR_MANUAL: ProveedorTerminal = {
  id: 'manual',
  nombre: 'Cobro en mostrador',
  // Lo importante de este módulo entero está en esta línea: aquí NO hay
  // tercero que confirme. La venta se registra ya cobrada porque quien la
  // registra ha visto el dinero — y el sistema lo dice así, en vez de fingir
  // una comprobación que no existe.
  esAutoritativo: false,
  async iniciar() { return { ok: true, referencia: '', estado: 'PAGADO' }; },
  async consultar() { return { estado: 'PAGADO' as const, importeCentimos: null }; },
  async cancelar() { /* nada que cancelar */ },
};

// ─── Selección ───────────────────────────────────────────────────────────────

export function proveedorPara(
  metodo: MetodoPago,
  opts: { readerId?: string | null; origen?: string } = {},
): ProveedorTerminal {
  switch (metodo) {
    case 'DATAFONO': return crearProveedorDatafono(opts.readerId ?? null);
    case 'BIZUM':    return crearProveedorBizum(opts.origen ?? '');
    // TARJETA sin datáfono integrado = el estudio pasa la tarjeta por el TPV
    // de su banco y lo apunta aquí. Es manual y así se registra, sin inventar
    // una confirmación que nadie ha dado.
    default:         return PROVEEDOR_MANUAL;
  }
}

/**
 * Prepara el contexto de cobro de un estudio: cliente de Stripe, cuenta
 * Connect y lector emparejado. Devuelve el motivo cuando no se puede cobrar,
 * en lugar de `null` a secas — el mostrador necesita saber QUÉ le falta.
 */
export async function contextoCobroDe(
  admin: SupabaseClient,
  studioId: string,
): Promise<{ ok: true; ctx: ContextoCobro; readerId: string | null } | { ok: false; motivo: string; status: number }> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_XXXX')) {
    return { ok: false, motivo: 'Stripe no está configurado en este servidor.', status: 503 };
  }
  // Mismo guardia que /api/stripe/checkout y /api/terminal/cobrar: con el
  // .env.local de producción copiado a una máquina, esta ruta cobraría de
  // verdad. Ver lib/billing/modo-stripe.ts.
  const modo = comprobarModoStripe();
  // `motivo` es opcional en el guardia; aquí NO puede serlo, porque este texto
  // es lo único que va a leer quien está en el mostrador preguntándose por qué
  // no puede cobrar. Un mensaje vacío sería peor que uno genérico.
  if (!modo.puedeCobrar) {
    return { ok: false, status: 503, motivo: modo.motivo ?? 'Los cobros con tarjeta no están disponibles en este entorno.' };
  }

  const { data: studio } = await admin
    .from('studios')
    .select('stripe_account_id, stripe_terminal_reader_id')
    .eq('id', studioId)
    .maybeSingle();

  const cuentaConnect = studio?.stripe_account_id ?? null;
  if (!cuentaConnect) {
    return { ok: false, motivo: 'Conecta tu cuenta de Stripe antes de cobrar con tarjeta.', status: 409 };
  }

  return {
    ok: true,
    readerId: studio?.stripe_terminal_reader_id ?? null,
    ctx: {
      stripe: new Stripe(key, { apiVersion: '2026-06-24.dahlia' }),
      // Ya comprobado no nulo arriba; se extrae a una constante para que el
      // compilador lo sepa también (`studio.x` vuelve a ser `string | null`
      // dentro del literal).
      stripeAccount: cuentaConnect,
      studioId,
      esTest: key.startsWith('sk_test'),
    },
  };
}

/** Tope del importe de un cobro en mostrador. Un typo no puede ser un cargo absurdo. */
export const MAX_CENTIMOS_POS = 1_000_000; // 10.000 €
