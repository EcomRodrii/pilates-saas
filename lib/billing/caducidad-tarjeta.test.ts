import { test } from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { caducidadDe, caducaAntesDe, guardarCaducidadTarjeta } from './caducidad-tarjeta.ts';

// Forma mínima de un PaymentMethod de Stripe: solo lo que se lee.
const pmTarjeta = (card: Record<string, unknown>) => ({ card } as never);

test('caducidadDe: extrae mes, año, marca y últimos 4', () => {
  const c = caducidadDe(pmTarjeta({ exp_month: 9, exp_year: 2026, brand: 'visa', last4: '4242' }));
  assert.deepEqual(c, { expMes: 9, expAnio: 2026, marca: 'visa', ultimos4: '4242' });
});

test('caducidadDe: lo que no es tarjeta (SEPA, Bizum) → null', () => {
  assert.equal(caducidadDe(undefined), null);
  assert.equal(caducidadDe(null), null);
  assert.equal(caducidadDe({ sepa_debit: {} } as never), null);
});

test('caducidadDe: sin los campos de caducidad → null, no un objeto a medias', () => {
  assert.equal(caducidadDe(pmTarjeta({ brand: 'visa', last4: '4242' })), null);
  assert.equal(caducidadDe(pmTarjeta({ exp_month: 9, brand: 'visa' })), null);
});

test('caducidadDe: un mes imposible se descarta entero', () => {
  assert.equal(caducidadDe(pmTarjeta({ exp_month: 13, exp_year: 2026 })), null);
  assert.equal(caducidadDe(pmTarjeta({ exp_month: 0, exp_year: 2026 })), null);
});

test('caducidadDe: unos "últimos 4" que no son 4 dígitos se guardan como null, no revientan el CHECK', () => {
  const c = caducidadDe(pmTarjeta({ exp_month: 9, exp_year: 2026, last4: '42' }));
  assert.ok(c);
  assert.equal(c.ultimos4, null);
  assert.equal(c.expMes, 9);
});

// ── El error clásico: una tarjeta 09/2026 vale TODO septiembre ──────────────

test('caducaAntesDe: la tarjeta sirve hasta el ÚLTIMO día de su mes', () => {
  const t = { expMes: 9, expAnio: 2026 };
  // Todo septiembre sigue valiendo, incluido el último día.
  assert.equal(caducaAntesDe(t, new Date('2026-09-01T00:00:00Z')), false);
  assert.equal(caducaAntesDe(t, new Date('2026-09-30T23:59:59Z')), false);
  // El 1 de octubre ya no.
  assert.equal(caducaAntesDe(t, new Date('2026-10-01T00:00:00Z')), true);
});

test('caducaAntesDe: cruza el año sin equivocarse', () => {
  const t = { expMes: 12, expAnio: 2026 };
  assert.equal(caducaAntesDe(t, new Date('2026-12-31T12:00:00Z')), false);
  assert.equal(caducaAntesDe(t, new Date('2027-01-01T00:00:00Z')), true);
});

test('caducaAntesDe: sin dato no se afirma nada (null NO es "caduca")', () => {
  assert.equal(caducaAntesDe({ expMes: null, expAnio: null }, new Date('2030-01-01T00:00:00Z')), false);
  assert.equal(caducaAntesDe({ expMes: 9, expAnio: null }, new Date('2030-01-01T00:00:00Z')), false);
});

// ── guardarCaducidadTarjeta: método muerto se limpia solo (auditoría 2026-09-29) ──

type Fila = Record<string, unknown>;

/** Supabase de mentira: sirve `eq()` encadenable y registra el update final. */
function fakeAdminSocios() {
  const updates: Array<{ fila: Fila; eqs: Array<[string, unknown]> }> = [];
  const admin = {
    from(tabla: string) {
      if (tabla !== 'socios') throw new Error(`tabla inesperada: ${tabla}`);
      return {
        update(fila: Fila) {
          const eqs: Array<[string, unknown]> = [];
          const builder = {
            eq(col: string, val: unknown) { eqs.push([col, val]); return builder; },
            then(resolve: (r: { error: null }) => void) {
              updates.push({ fila, eqs });
              resolve({ error: null });
            },
          };
          return builder;
        },
      };
    },
  };
  return { admin: admin as never, updates };
}

test('un método que Stripe ya no reconoce (resource_missing) se limpia de la socia', async () => {
  const { admin, updates } = fakeAdminSocios();
  const stripe = {
    paymentMethods: {
      retrieve: async () => {
        throw new Stripe.errors.StripeInvalidRequestError({ code: 'resource_missing', type: 'invalid_request_error' } as never);
      },
    },
  } as never;
  const r = await guardarCaducidadTarjeta(admin, stripe, {
    socioId: 'soc-1', studioId: 'studio-1', paymentMethodId: 'pm_muerto', stripeAccount: 'acct_1',
  });
  assert.equal(r, null);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].fila.stripe_payment_method_id, null);
  // Compare-and-set: nunca borra a ciegas, solo si ESE id sigue siendo el guardado.
  assert.deepEqual(updates[0].eqs, [['id', 'soc-1'], ['studio_id', 'studio-1'], ['stripe_payment_method_id', 'pm_muerto']]);
});

test('un fallo pasajero (timeout, red) NO limpia nada — se reintenta solo mañana', async () => {
  const { admin, updates } = fakeAdminSocios();
  const stripe = {
    paymentMethods: { retrieve: async () => { throw new Error('ETIMEDOUT'); } },
  } as never;
  const r = await guardarCaducidadTarjeta(admin, stripe, {
    socioId: 'soc-1', studioId: 'studio-1', paymentMethodId: 'pm_1', stripeAccount: 'acct_1',
  });
  assert.equal(r, null);
  assert.equal(updates.length, 0, 'un timeout no es "ya no existe"');
});
