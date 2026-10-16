import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESTADOS_QUE_FRENAN_LA_BAJA, suscripcionEnStripe } from './suscripcion-en-stripe.ts';

type SubFalsa = string | { status: string; metadata: Record<string, string> };

// Un Stripe falso: las suscripciones de cada cliente, o un error si el cliente está en `caidos`.
const stripeCon = (porCliente: Record<string, SubFalsa[]>, caidos: string[] = []) => {
  const preguntados: string[] = [];
  const stripe = {
    subscriptions: {
      list: async ({ customer }: { customer: string }) => {
        preguntados.push(customer);
        if (caidos.includes(customer)) throw new Error('caído');
        return {
          data: (porCliente[customer] ?? []).map((s, i) => ({
            id: `sub_${customer}_${i}`, ...(typeof s === 'string' ? { status: s, metadata: {} } : s),
          })),
        };
      },
    },
  } as never;
  return { stripe, preguntados };
};

test('frenan una baja lo vivo y un primer pago a medio confirmar; lo terminado, no', () => {
  for (const st of ['active', 'trialing', 'past_due', 'unpaid', 'incomplete']) assert.ok(ESTADOS_QUE_FRENAN_LA_BAJA.includes(st), st);
  for (const st of ['canceled', 'incomplete_expired']) assert.ok(!ESTADOS_QUE_FRENAN_LA_BAJA.includes(st), st);
});

test('devuelve la primera suscripción en esos estados, mirando cada cliente (el del estudio y el de su cadena)', async () => {
  const { stripe, preguntados } = stripeCon({ cus_estudio: ['canceled'], cus_cadena: ['incomplete'] });
  assert.deepEqual(await suscripcionEnStripe(stripe, ['cus_estudio', 'cus_cadena'], ESTADOS_QUE_FRENAN_LA_BAJA), { id: 'sub_cus_cadena_0', status: 'incomplete' });
  assert.deepEqual(preguntados, ['cus_estudio', 'cus_cadena']);
});

test('con «de quién», solo cuentan las del estudio, las de su cadena y las que no dicen de quién son', async () => {
  const deQuien = { studioId: 'st-sede', cadenaId: 'cad-1' };
  const ajena = { status: 'active', metadata: { studioId: 'st-otra-sede' } };
  // El plan suelto de otra sede en el mismo cliente (cadenas migradas en la 0066) no frena a esta.
  assert.equal(await suscripcionEnStripe(stripeCon({ cus: [ajena] }).stripe, ['cus'], ESTADOS_QUE_FRENAN_LA_BAJA, deQuien), null);
  // Sin «de quién» (la conversión al gratis), cualquiera cuenta: ante la duda, no se toca.
  assert.ok(await suscripcionEnStripe(stripeCon({ cus: [ajena] }).stripe, ['cus'], ESTADOS_QUE_FRENAN_LA_BAJA));
  for (const metadata of [{ studioId: 'st-sede' }, { cadenaId: 'cad-1', studioId: 'st-otra-sede' }, {}]) {
    const r = await suscripcionEnStripe(stripeCon({ cus: [{ status: 'past_due', metadata }] }).stripe, ['cus'], ESTADOS_QUE_FRENAN_LA_BAJA, deQuien);
    assert.equal(r?.status, 'past_due', JSON.stringify(metadata));
  }
});

test('sin nada vivo, null; y si Stripe no contesta, lanza (nunca es «no paga»)', async () => {
  assert.equal(await suscripcionEnStripe(stripeCon({ cus_1: ['canceled', 'incomplete_expired'] }).stripe, ['cus_1'], ESTADOS_QUE_FRENAN_LA_BAJA), null);
  await assert.rejects(suscripcionEnStripe(stripeCon({}, ['cus_1']).stripe, ['cus_1'], ESTADOS_QUE_FRENAN_LA_BAJA), /caído/);
});
