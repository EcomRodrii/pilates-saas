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

function fakeStripe(opts: { retrieveThrows?: boolean; pi?: Record<string, unknown> } = {}) {
  return {
    paymentIntents: {
      retrieve: async (_id: string) => {
        if (opts.retrieveThrows) throw new Error('stripe caído');
        return opts.pi ?? {};
      },
    },
    paymentMethods: {
      // guardarCaducidadTarjeta: sin campos de tarjeta, caducidadDe() da null
      // y no escribe nada más — best-effort, no afecta a estos tests.
      retrieve: async () => ({}),
    },
  } as never;
}

const PI_TARJETA_REUTILIZABLE = {
  id: 'pi_1', payment_method: { id: 'pm_1', type: 'card' }, setup_future_usage: 'off_session',
};

const args = (over: Partial<Parameters<typeof guardarMetodoDeCompra>[2]> = {}) => ({
  studioId: 'studio-1', socioId: 'soc-1', customerId: 'cus-1', stripeAccount: 'acct_1',
  exigirIdentidadDemostrada: false,
  ...over,
});

test('sin socioId/studioId/customerId: no-op, no toca nada', async () => {
  const { admin, updates } = fakeAdmin();
  const stripe = fakeStripe();
  const r = await guardarMetodoDeCompra(admin, stripe, args({ socioId: null }));
  assert.deepEqual(r, { ok: true, guardado: false });
  assert.equal(updates.length, 0);
});

test('exige identidad demostrada y no lo está: no-op sin llamar a Stripe', async () => {
  const { admin, updates } = fakeAdmin();
  let llamadoStripe = false;
  const stripe = fakeStripe();
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
  const stripe = fakeStripe({ pi: PI_TARJETA_REUTILIZABLE });
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
  const stripe = fakeStripe({ pi: PI_TARJETA_REUTILIZABLE });
  const r = await guardarMetodoDeCompra(admin, stripe, args({ paymentIntentId: 'pi_1' }));
  assert.equal(r.ok, true);
  assert.equal(r.guardado, true);
  assert.equal(updates[0].stripe_payment_method_id, 'pm_1');
});

test('Modo B (paymentIntent ya cargado): no vuelve a llamar a Stripe para recuperarlo', async () => {
  const { admin, updates } = fakeAdmin();
  let retrieveLlamado = false;
  const stripe = fakeStripe();
  (stripe as { paymentIntents: { retrieve: () => void } }).paymentIntents.retrieve = () => { retrieveLlamado = true; return Promise.resolve({}); };
  const r = await guardarMetodoDeCompra(admin, stripe, args({ paymentIntent: PI_TARJETA_REUTILIZABLE }));
  assert.equal(r.guardado, true);
  assert.equal(retrieveLlamado, false);
  assert.equal(updates.length, 1);
});

test('Bizum (no reutilizable): no guarda nada, y no es un error', async () => {
  const { admin, updates } = fakeAdmin();
  const bizum = { id: 'pi_2', payment_method: { id: 'pm_2', type: 'bizum' }, setup_future_usage: 'off_session' };
  const stripe = fakeStripe({ pi: bizum });
  const r = await guardarMetodoDeCompra(admin, stripe, args({ paymentIntentId: 'pi_2' }));
  assert.deepEqual(r, { ok: true, guardado: false });
  assert.equal(updates.length, 0);
});

test('el UPDATE de socios falla: ok:false con motivo, nunca lanza', async () => {
  const { admin } = fakeAdmin({ errorUpdate: 'conexión perdida' });
  const stripe = fakeStripe({ pi: PI_TARJETA_REUTILIZABLE });
  const r = await guardarMetodoDeCompra(admin, stripe, args({ paymentIntentId: 'pi_1' }));
  assert.equal(r.ok, false);
  assert.equal(r.guardado, false);
  assert.match((r as { motivo: string }).motivo, /conexión perdida/);
});

test('Stripe no responde al recuperar el PaymentIntent: ok:false, nunca lanza', async () => {
  const { admin, updates } = fakeAdmin();
  const stripe = fakeStripe({ retrieveThrows: true });
  const r = await guardarMetodoDeCompra(admin, stripe, args({ paymentIntentId: 'pi_1' }));
  assert.equal(r.ok, false);
  assert.equal(updates.length, 0);
});

test('sin paymentIntentId ni paymentIntent: no-op', async () => {
  const { admin, updates } = fakeAdmin();
  const stripe = fakeStripe();
  const r = await guardarMetodoDeCompra(admin, stripe, args());
  assert.deepEqual(r, { ok: true, guardado: false });
  assert.equal(updates.length, 0);
});
