import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barrerPacksSinAcreditar } from './packs-conciliar.ts';

const sesion = (id: string, o: Record<string, unknown> = {}) => ({
  id, mode: 'payment', status: 'complete', payment_status: 'paid', amount_total: 900, currency: 'eur', created: 1_790_000_000,
  client_reference_id: 'studio-x', metadata: { origen: 'ia_pack', studio_id: 'studio-x', pack: '100' },
  payment_intent: { id: `pi_${id}`, latest_charge: { amount_refunded: 0, disputed: false } }, ...o,
});

function falsos(sesiones: unknown[], yaAcreditadas: string[] = []) {
  const insertadas: Record<string, unknown>[] = [];
  const pedidas: unknown[] = [];
  const admin = {
    from: () => ({
      upsert: (fila: Record<string, unknown>) => ({
        select: async () => {
          if (yaAcreditadas.includes(fila.stripe_checkout_session_id as string)) return { data: [], error: null };
          insertadas.push(fila);
          return { data: [{ id: 'p' }], error: null };
        },
      }),
    }),
  };
  const stripe = { checkout: { sessions: { list: (q: unknown) => { pedidas.push(q); return (async function* () { yield* sesiones; })(); } } } };
  return { admin: admin as never, stripe: stripe as never, insertadas, pedidas };
}

test('acredita los packs pagados que el webhook no entregó, y solo esos', async () => {
  const { admin, stripe, insertadas, pedidas } = falsos([
    sesion('cs_a'),
    sesion('cs_ya'), // el webhook ya lo hizo: idempotente
    sesion('cs_saas', { mode: 'subscription', metadata: { studioId: 'studio-x', plan: 'ESTUDIO' } }),
    sesion('cs_sepa', { payment_status: 'unpaid' }),
    sesion('cs_devuelto', { payment_intent: { id: 'pi_d', latest_charge: { amount_refunded: 900, disputed: false } } }),
    sesion('cs_disputa', { payment_intent: { id: 'pi_e', latest_charge: { amount_refunded: 0, disputed: true } } }),
  ], ['cs_ya']);
  const r = await barrerPacksSinAcreditar(admin, stripe, 1_790_100_000_000);
  assert.deepEqual(r.acreditados, ['cs_a']);
  assert.deepEqual(r.sinTocar, ['cs_devuelto', 'cs_disputa']);
  assert.equal(insertadas.length, 1);
  assert.equal(insertadas[0].estado, 'ACTIVO');
  const q = pedidas[0] as { created: { gte: number }; status: string };
  assert.equal(q.status, 'complete');
  assert.equal(q.created.gte, 1_790_100_000 - 72 * 3600, 'las últimas 72 h');
});
