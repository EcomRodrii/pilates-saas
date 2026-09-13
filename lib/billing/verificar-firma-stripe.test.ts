import { test } from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { verificarFirmaStripe } from './verificar-firma-stripe.ts';

// Sin red: generateTestHeaderString y constructEvent son HMAC locales.
const stripe = new Stripe('sk_test_local_sin_red');
const payload = JSON.stringify({ id: 'evt_test', object: 'event', type: 'checkout.session.completed' });
const firmar = (secret: string) => stripe.webhooks.generateTestHeaderString({ payload, secret });

test('la librería acepta una firma hecha con secreto vacío: por eso no se le puede pasar nunca ""', () => {
  assert.doesNotThrow(() => stripe.webhooks.constructEvent(payload, firmar(''), ''));
});

test('sin ningún secreto configurado → sin-secreto, aunque la firma se haya calculado con clave vacía', () => {
  for (const secretos of [[], [undefined], [''], ['   ', null], [undefined, '']]) {
    const r = verificarFirmaStripe(stripe, payload, firmar(''), secretos);
    assert.deepEqual(r, { ok: false, motivo: 'sin-secreto' }, `secretos=${JSON.stringify(secretos)}`);
  }
});

test('un secreto vacío junto a uno real no abre la puerta a firmas con clave vacía', () => {
  const r = verificarFirmaStripe(stripe, payload, firmar(''), ['whsec_real_de_test', '']);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.motivo, 'firma-invalida');
});

test('firma correcta con el secreto de plataforma → evento', () => {
  const r = verificarFirmaStripe(stripe, payload, firmar('whsec_plataforma'), ['whsec_plataforma', 'whsec_connect']);
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.evento.id, 'evt_test');
});

test('firma correcta con el secreto de Connect (segundo) → evento', () => {
  const r = verificarFirmaStripe(stripe, payload, firmar('whsec_connect'), ['whsec_plataforma', 'whsec_connect']);
  assert.equal(r.ok, true);
});

test('firma con otro secreto, cuerpo alterado o cabecera ausente → firma-invalida', () => {
  assert.equal(verificarFirmaStripe(stripe, payload, firmar('whsec_otro'), ['whsec_plataforma']).ok, false);
  assert.equal(verificarFirmaStripe(stripe, `${payload} `, firmar('whsec_plataforma'), ['whsec_plataforma']).ok, false);
  const sinCabecera = verificarFirmaStripe(stripe, payload, '', ['whsec_plataforma']);
  assert.equal(sinCabecera.ok === false && sinCabecera.motivo, 'firma-invalida');
});
