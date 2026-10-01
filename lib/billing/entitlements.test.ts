import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  accesoProducto, tieneFeature, entitlementsDe, PLAN_ENTITLEMENTS, PLAN_INFO, PLANES, planMinimoPara,
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

test('planMinimoPara: el plan más barato que ya incluye la feature', () => {
  assert.equal(planMinimoPara('gamificacion'), 'ESTUDIO');
  assert.equal(planMinimoPara('marketing'), 'ESTUDIO');
  assert.equal(planMinimoPara('ia'), 'ESTUDIO');
  assert.equal(planMinimoPara('decisiones'), 'ESTUDIO');
  assert.equal(planMinimoPara('multiCentro'), 'CADENA'); // solo CADENA la tiene
});

// Decisión del fundador (2-oct-2026): el plan de entrada se llama «Founding
// Studio» y trae la app con la marca del estudio. Su id sigue siendo BASE
// (`studios.plan` y los price IDs de Stripe lo guardan así).
test('el plan de entrada se enseña como Founding Studio e incluye la app de marca', () => {
  assert.equal(PLAN_INFO.BASE.nombre, 'Founding Studio');
  for (const p of PLANES) assert.equal(PLAN_ENTITLEMENTS[p].features.marca, true, `${p} sin app de marca`);
  assert.equal(tieneFeature({ plan: 'BASE', subscriptionStatus: 'active' }, 'marca'), true);
  // Sin suscripción activa no hay marca, como con cualquier otra función.
  assert.equal(tieneFeature({ plan: 'BASE', subscriptionStatus: 'trial_expirado' }, 'marca'), false);
});
