import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  avisoPendientes, conReintentos, cuentaYaNoExiste, stripeYaNoExiste, type TerceroPendiente,
} from './terceros-supresion.ts';

function relojFalso() {
  const esperas: number[] = [];
  return { esperas, dormir: async (ms: number) => { esperas.push(ms); } };
}

test('conReintentos: a la primera no espera', async () => {
  const { esperas, dormir } = relojFalso();
  let llamadas = 0;
  const r = await conReintentos(async () => { llamadas++; }, { dormir });
  assert.deepEqual(r, { ok: true, intentos: 1 });
  assert.equal(llamadas, 1);
  assert.deepEqual(esperas, []);
});

test('conReintentos: reintenta con espera creciente y acaba bien', async () => {
  const { esperas, dormir } = relojFalso();
  let llamadas = 0;
  const r = await conReintentos(async () => {
    llamadas++;
    if (llamadas < 3) throw new Error(`fallo ${llamadas}`);
  }, { dormir });
  assert.deepEqual(r, { ok: true, intentos: 3 });
  assert.deepEqual(esperas, [300, 900]);
});

test('conReintentos: si nunca sale, devuelve el ÚLTIMO error y no espera tras el último intento', async () => {
  const { esperas, dormir } = relojFalso();
  let llamadas = 0;
  const r = await conReintentos(async () => {
    llamadas++;
    throw { message: `timeout ${llamadas}` };
  }, { dormir, intentos: 3 });
  assert.deepEqual(r, { ok: false, intentos: 3, error: 'timeout 3' });
  assert.equal(llamadas, 3);
  assert.equal(esperas.length, 2);
});

test('Stripe: un cliente que ya no existe cuenta como borrado; otro error no', () => {
  assert.equal(stripeYaNoExiste({ code: 'resource_missing' }), true);
  assert.equal(stripeYaNoExiste({ raw: { code: 'resource_missing' } }), true);
  assert.equal(stripeYaNoExiste({ statusCode: 404 }), true);
  assert.equal(stripeYaNoExiste({ code: 'rate_limit', statusCode: 429 }), false);
  assert.equal(stripeYaNoExiste(new Error('boom')), false);
  assert.equal(stripeYaNoExiste(null), false);
});

test('Auth: una cuenta que ya no existe cuenta como borrada; otro error no', () => {
  assert.equal(cuentaYaNoExiste({ status: 404, message: 'User not found' }), true);
  assert.equal(cuentaYaNoExiste({ code: 'user_not_found' }), true);
  assert.equal(cuentaYaNoExiste({ message: 'user not found' }), true);
  assert.equal(cuentaYaNoExiste({ status: 500, message: 'Database error deleting user' }), false);
  assert.equal(cuentaYaNoExiste(undefined), false);
});

test('aviso al panel: nada si no hay pendientes; dice QUÉ falta y no filtra ids', () => {
  assert.equal(avisoPendientes([]), null);
  const pendientes: TerceroPendiente[] = [
    { tercero: 'stripe_customer', ref: 'cus_SECRETO', cuenta: 'acct_X', motivo: 'Stripe: timeout', en: '2026-09-13T00:00:00Z' },
    { tercero: 'cuenta_acceso', ref: '00000000-0000-0000-0000-000000000000', motivo: 'Cuenta: 500', en: '2026-09-13T00:00:00Z' },
  ];
  const aviso = avisoPendientes(pendientes) ?? '';
  assert.match(aviso, /Stripe/);
  assert.match(aviso, /cuenta de acceso/);
  assert.doesNotMatch(aviso, /cus_SECRETO|acct_X|00000000/);
  assert.doesNotMatch(avisoPendientes([pendientes[0]]) ?? '', /cuenta de acceso/);
});
