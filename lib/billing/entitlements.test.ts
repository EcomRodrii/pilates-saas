import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  accesoProducto, tieneFeature, puedeAnadirSocia, entitlementsDe, PLAN_ENTITLEMENTS, planMinimoPara,
} from './entitlements.ts';

test('accesoProducto: solo con suscripción activa (sin trial)', () => {
  assert.equal(accesoProducto({ subscriptionStatus: 'active' }), true);
  assert.equal(accesoProducto({ subscriptionStatus: 'past_due' }), true); // gracia
  assert.equal(accesoProducto({ subscriptionStatus: 'canceled' }), false);
  assert.equal(accesoProducto({ subscriptionStatus: null }), false);
  assert.equal(accesoProducto({ subscriptionStatus: undefined }), false);
});

test('plan desconocido/ausente cae a BASE', () => {
  assert.deepEqual(entitlementsDe({ plan: null }), PLAN_ENTITLEMENTS.BASE);
  assert.deepEqual(entitlementsDe({ plan: 'RANDOM' }), PLAN_ENTITLEMENTS.BASE);
  assert.deepEqual(entitlementsDe({ plan: 'CADENA' }), PLAN_ENTITLEMENTS.CADENA);
});

test('tieneFeature: exige suscripción activa Y que el plan la incluya', () => {
  const estudioActivo = { plan: 'ESTUDIO', subscriptionStatus: 'active' };
  const baseActivo = { plan: 'BASE', subscriptionStatus: 'active' };
  const estudioSinSub = { plan: 'ESTUDIO', subscriptionStatus: null };

  assert.equal(tieneFeature(estudioActivo, 'gamificacion'), true);
  assert.equal(tieneFeature(baseActivo, 'gamificacion'), false); // BASE no incluye
  assert.equal(tieneFeature(estudioSinSub, 'gamificacion'), false); // sin suscripción
  assert.equal(tieneFeature(estudioActivo, 'multiCentro'), false); // solo CADENA
});

test('puedeAnadirSocia respeta el tope del plan', () => {
  assert.equal(puedeAnadirSocia({ plan: 'BASE' }, 149), true);
  assert.equal(puedeAnadirSocia({ plan: 'BASE' }, 150), false);
  assert.equal(puedeAnadirSocia({ plan: 'ESTUDIO' }, 100000), true); // ilimitado
});

test('planMinimoPara: el plan más barato que ya incluye la feature', () => {
  assert.equal(planMinimoPara('gamificacion'), 'ESTUDIO');
  assert.equal(planMinimoPara('marketing'), 'ESTUDIO');
  assert.equal(planMinimoPara('ia'), 'ESTUDIO');
  assert.equal(planMinimoPara('decisiones'), 'ESTUDIO');
  assert.equal(planMinimoPara('multiCentro'), 'CADENA'); // solo CADENA la tiene
});
