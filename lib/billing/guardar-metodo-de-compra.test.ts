import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardarMetodoDeCompra } from './guardar-metodo-de-compra.ts';

type Fila = Record<string, unknown>;

/** Supabase de mentira: solo `socios.update(...).eq(...).eq(...)`, que es lo
 *  único que toca este módulo (guardarCaducidadTarjeta usa el mismo `admin`
 *  pero con su propio UPDATE — se deja pasar, no es el objeto de estos tests). */
function fakeAdmin(opts: { errorUpdate?: string } = {}) {
  const updates: Fila[] = [];
  // `.update(fila).eq(...).eq(...)` resuelve a `{error}` en el segundo `eq`.
  const admin = {
    from(tabla: string) {
      return {
        update(fila: Fila) {
          if (tabla === 'socios') updates.push(fila);
          return {
            eq: () => ({
              eq: () => Promise.resolve({ error: opts.errorUpdate ? { message: opts.errorUpdate } : null }),
            }),
          };
        },
      };
    },
  };
  return { admin: admin as never, updates };
}

/**
 * `pm`: lo que devuelve `paymentMethods.retrieve` — lo usan tanto la consulta
 * del tipo real como guardarCaducidadTarjeta (que sin campos de tarjeta no
 * escribe nada: best-effort, no afecta a estos tests). `pmPedidos` cuenta las
 * llamadas, para distinguir «preguntó el tipo» de «solo leyó la caducidad».
 */
function fakeStripe(opts: { retrieveThrows?: boolean; pi?: Record<string, unknown>; pm?: Record<string, unknown>; pmThrows?: boolean } = {}) {
  const pmPedidos: string[] = [];
  const stripe = {
    paymentIntents: {
      retrieve: async (_id: string) => {
        if (opts.retrieveThrows) throw new Error('stripe caído');
        return opts.pi ?? {};
      },
    },
    paymentMethods: {
      retrieve: async (id: string) => {
        pmPedidos.push(id);
        if (opts.pmThrows) throw new Error('stripe caído');
        return opts.pm ?? {};
      },
    },
  };
  return { stripe: stripe as never, pmPedidos };
}

const PI_TARJETA_REUTILIZABLE = {
  id: 'pi_1', payment_method: { id: 'pm_1', type: 'card' }, setup_future_usage: 'off_session',
};

// Lo que llega del checkout embebido: `automatic_payment_methods`, método sin
// expandir, y `payment_method_types` con todo lo ofrecido.
const PI_EMBEBIDO_SIN_EXPANDIR = {
  id: 'pi_3', payment_method: 'pm_3', payment_method_types: ['card', 'link'], setup_future_usage: 'off_session',
};

const args = (over: Partial<Parameters<typeof guardarMetodoDeCompra>[2]> = {}) => ({
  studioId: 'studio-1', socioId: 'soc-1', customerId: 'cus-1', stripeAccount: 'acct_1',
  exigirIdentidadDemostrada: false,
  ...over,
});

test('sin socioId/studioId/customerId: no-op, no toca nada', async () => {
  const { admin, updates } = fakeAdmin();
  const { stripe } = fakeStripe();
  const r = await guardarMetodoDeCompra(admin, stripe, args({ socioId: null }));
  assert.deepEqual(r, { ok: true, guardado: false });
  assert.equal(updates.length, 0);
});

test('exige identidad demostrada y no lo está: no-op sin llamar a Stripe', async () => {
  const { admin, updates } = fakeAdmin();
  let llamadoStripe = false;
  const { stripe } = fakeStripe();
  (stripe as { paymentIntents: { retrieve: () => void } }).paymentIntents.retrieve = () => { llamadoStripe = true; return Promise.resolve({}); };
  const r = await guardarMetodoDeCompra(admin, stripe, args({
    exigirIdentidadDemostrada: true, socioIdVerificado: null, fichaCreada: false,
    paymentIntentId: 'pi_1',
  }));
  assert.deepEqual(r, { ok: true, guardado: false });
  assert.equal(updates.length, 0);
  assert.equal(llamadoStripe, false, 'sin identidad demostrada no hace falta ni preguntarle a Stripe');
});

test('ficha recién creada demuestra identidad igual que un socioId verificado', async () => {
  const { admin, updates } = fakeAdmin();
  const { stripe } = fakeStripe({ pi: PI_TARJETA_REUTILIZABLE });
  const r = await guardarMetodoDeCompra(admin, stripe, args({
    exigirIdentidadDemostrada: true, socioIdVerificado: null, fichaCreada: true,
    paymentIntentId: 'pi_1',
  }));
  assert.equal(r.ok, true);
  assert.equal(r.guardado, true);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].stripe_payment_method_id, 'pm_1');
  assert.equal(updates[0].stripe_customer_id, 'cus-1');
});

test('Modo A (paymentIntentId): recupera y expande, guarda si es tarjeta reutilizable', async () => {
  const { admin, updates } = fakeAdmin();
  const { stripe } = fakeStripe({ pi: PI_TARJETA_REUTILIZABLE });
  const r = await guardarMetodoDeCompra(admin, stripe, args({ paymentIntentId: 'pi_1' }));
  assert.equal(r.ok, true);
  assert.equal(r.guardado, true);
  assert.equal(updates[0].stripe_payment_method_id, 'pm_1');
});

test('Modo B (paymentIntent ya cargado): no vuelve a llamar a Stripe para recuperarlo', async () => {
  const { admin, updates } = fakeAdmin();
  let retrieveLlamado = false;
  const { stripe } = fakeStripe();
  (stripe as { paymentIntents: { retrieve: () => void } }).paymentIntents.retrieve = () => { retrieveLlamado = true; return Promise.resolve({}); };
  const r = await guardarMetodoDeCompra(admin, stripe, args({ paymentIntent: PI_TARJETA_REUTILIZABLE }));
  assert.equal(r.guardado, true);
  assert.equal(retrieveLlamado, false);
  assert.equal(updates.length, 1);
});

test('⚠️ checkout embebido (métodos automáticos, sin expandir): pregunta el tipo y guarda la TARJETA', async () => {
  // Antes: `payment_method_types` = ['card','link'] y método sin expandir →
  // `metodoReutilizableDe` no se arriesgaba y no guardaba NADA, ni una tarjeta
  // pagada con tarjeta. La cuota comprada ahí no se renovaba sola.
  const { admin, updates } = fakeAdmin();
  const { stripe, pmPedidos } = fakeStripe({ pm: { id: 'pm_3', type: 'card' } });
  const r = await guardarMetodoDeCompra(admin, stripe, args({ paymentIntent: PI_EMBEBIDO_SIN_EXPANDIR }));
  assert.deepEqual(r, { ok: true, guardado: true });
  assert.equal(updates[0].stripe_payment_method_id, 'pm_3');
  assert.equal(pmPedidos[0], 'pm_3', 'pregunta el tipo del método que se usó');
});

test('pagado con Link en el checkout embebido: se guarda (se cobra después off-session)', async () => {
  const { admin, updates } = fakeAdmin();
  const { stripe } = fakeStripe({ pm: { id: 'pm_3', type: 'link' } });
  const r = await guardarMetodoDeCompra(admin, stripe, args({ paymentIntent: PI_EMBEBIDO_SIN_EXPANDIR }));
  assert.deepEqual(r, { ok: true, guardado: true });
  assert.equal(updates[0].stripe_payment_method_id, 'pm_3');
  // Y limpia la tarjeta anterior: sin esto el portal seguía enseñando
  // «Visa •••• 4242» y el aviso de caducidad saltaba por ella.
  assert.deepEqual(updates[1], { tarjeta_exp_mes: null, tarjeta_exp_anio: null, tarjeta_marca: 'link', tarjeta_ultimos4: null });
});

test('checkout embebido de invitada sin identidad demostrada: ni una llamada a Stripe', async () => {
  // El guard de identidad va ANTES de preguntar el tipo del método: quien no
  // puede dejar su método guardado tampoco provoca consultas.
  const { admin, updates } = fakeAdmin();
  const { stripe, pmPedidos } = fakeStripe({ pm: { id: 'pm_3', type: 'card' } });
  const r = await guardarMetodoDeCompra(admin, stripe, args({
    paymentIntent: PI_EMBEBIDO_SIN_EXPANDIR, exigirIdentidadDemostrada: true, socioIdVerificado: null, fichaCreada: false,
  }));
  assert.deepEqual(r, { ok: true, guardado: false });
  assert.equal(updates.length, 0);
  assert.deepEqual(pmPedidos, []);
});

test('pagado con un método que no se puede reutilizar: no guarda, y no es un error', async () => {
  const { admin, updates } = fakeAdmin();
  const { stripe } = fakeStripe({ pm: { id: 'pm_3', type: 'klarna' } });
  const r = await guardarMetodoDeCompra(admin, stripe, args({ paymentIntent: PI_EMBEBIDO_SIN_EXPANDIR }));
  assert.deepEqual(r, { ok: true, guardado: false });
  assert.equal(updates.length, 0);
});

test('Stripe no responde al preguntar el tipo: ok:false (el webhook reintenta), sin guardar', async () => {
  const { admin, updates } = fakeAdmin();
  const { stripe } = fakeStripe({ pmThrows: true });
  const r = await guardarMetodoDeCompra(admin, stripe, args({ paymentIntent: PI_EMBEBIDO_SIN_EXPANDIR }));
  assert.equal(r.ok, false);
  assert.match((r as { motivo: string }).motivo, /método de pago/);
  assert.equal(updates.length, 0);
});

test('ofrecida solo tarjeta y sin expandir: se guarda sin preguntar el tipo', async () => {
  const { admin, updates } = fakeAdmin();
  const { stripe, pmPedidos } = fakeStripe();
  const pi = { id: 'pi_4', payment_method: 'pm_4', payment_method_types: ['card'], setup_future_usage: 'off_session' };
  const r = await guardarMetodoDeCompra(admin, stripe, args({ paymentIntent: pi }));
  assert.equal(r.guardado, true);
  assert.equal(updates[0].stripe_payment_method_id, 'pm_4');
  // La única lectura del PaymentMethod es la de la caducidad, DESPUÉS de guardar.
  assert.deepEqual(pmPedidos, ['pm_4']);
});

test('Bizum (no reutilizable): no guarda nada, y no es un error', async () => {
  const { admin, updates } = fakeAdmin();
  const bizum = { id: 'pi_2', payment_method: { id: 'pm_2', type: 'bizum' }, setup_future_usage: 'off_session' };
  const { stripe } = fakeStripe({ pi: bizum });
  const r = await guardarMetodoDeCompra(admin, stripe, args({ paymentIntentId: 'pi_2' }));
  assert.deepEqual(r, { ok: true, guardado: false });
  assert.equal(updates.length, 0);
});

test('el UPDATE de socios falla: ok:false con motivo, nunca lanza', async () => {
  const { admin } = fakeAdmin({ errorUpdate: 'conexión perdida' });
  const { stripe } = fakeStripe({ pi: PI_TARJETA_REUTILIZABLE });
  const r = await guardarMetodoDeCompra(admin, stripe, args({ paymentIntentId: 'pi_1' }));
  assert.equal(r.ok, false);
  assert.equal(r.guardado, false);
  assert.match((r as { motivo: string }).motivo, /conexión perdida/);
});

test('Stripe no responde al recuperar el PaymentIntent: ok:false, nunca lanza', async () => {
  const { admin, updates } = fakeAdmin();
  const { stripe } = fakeStripe({ retrieveThrows: true });
  const r = await guardarMetodoDeCompra(admin, stripe, args({ paymentIntentId: 'pi_1' }));
  assert.equal(r.ok, false);
  assert.equal(updates.length, 0);
});

test('sin paymentIntentId ni paymentIntent: no-op', async () => {
  const { admin, updates } = fakeAdmin();
  const { stripe } = fakeStripe();
  const r = await guardarMetodoDeCompra(admin, stripe, args());
  assert.deepEqual(r, { ok: true, guardado: false });
  assert.equal(updates.length, 0);
});
