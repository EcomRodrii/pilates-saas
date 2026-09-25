import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

// PAY-7: `secretoIndice` dice cuál de los secretos verificó, contando sobre el
// array ORIGINAL (un secreto ausente no corre las posiciones).
test('PAY-7: devuelve la posición original del secreto que verificó', () => {
  const stripe = {
    webhooks: {
      constructEvent: (_c: string, _f: string, secreto: string) => {
        if (secreto === 'connect') return { id: 'evt_1', type: 'x' };
        throw new Error('firma no coincide');
      },
    },
  } as unknown as Parameters<typeof verificarFirmaStripe>[0];
  const r = verificarFirmaStripe(stripe, '{}', 'sig', ['plataforma', 'connect']);
  assert.equal(r.ok && r.secretoIndice, 1);
  // Con el primero vacío, el segundo SIGUE siendo el índice 1.
  const r2 = verificarFirmaStripe(stripe, '{}', 'sig', [undefined, 'connect']);
  assert.equal(r2.ok && r2.secretoIndice, 1);
});

test('⚠️ PAY-7: la ruta Connect rechaza un evento sin cuenta firmado con el secreto Connect, antes de reclamarlo', () => {
  const ruta = readFileSync(new URL('../../app/api/stripe/webhook/route.ts', import.meta.url), 'utf8');
  const puerta = ruta.indexOf('firma.secretoIndice === 1 && !event.account');
  assert.ok(puerta > 0, 'falta la comprobación de secreto cruzado');
  const reclamo = ruta.indexOf('reclamarWebhookEvent(');
  assert.ok(reclamo > puerta, 'la comprobación va ANTES de reclamar el evento: un evento rechazado no puede quedar «en proceso»');
  // El orden de los secretos que se pasan es lo que da sentido al índice 1.
  assert.match(ruta, /verificarFirmaStripe\(stripe, body, sig, \[webhookSecret, connectWebhookSecret\]\)/);
});

test('⚠️ PAY-4: los retornos terminales y completos del webhook marcan el evento antes de salir', () => {
  const ruta = readFileSync(new URL('../../app/api/stripe/webhook/route.ts', import.meta.url), 'utf8');
  for (const marca of ["ignorado: 'suscripcion_saas'", "ignorado: 'pago_no_completado'"]) {
    const i = ruta.indexOf(marca);
    assert.ok(i > 0, `no se encuentra el retorno ${marca}`);
    assert.ok(ruta.slice(Math.max(0, i - 120), i).includes('await marcarProcesado()'), `${marca}: sin marcar el evento`);
  }
  // Cinco retornos terminales + el final de la función.
  assert.ok(ruta.split('await marcarProcesado()').length - 1 >= 6, 'faltan marcados: un evento completo se queda en procesando');
  // Los éxitos PARCIALES con trabajo pendiente a mano NO se marcan.
  for (const parcial of ["entregado: false, motivo: entrega.motivo"]) {
    for (let i = ruta.indexOf(parcial); i > 0; i = ruta.indexOf(parcial, i + 1)) {
      assert.ok(!ruta.slice(Math.max(0, i - 120), i).includes('await marcarProcesado()'), 'un éxito parcial no debe marcarse');
    }
  }
});
