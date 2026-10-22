import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  accesoProducto, tieneFeature, entitlementsDe, ENTITLEMENTS_GRATIS, PLAN_ENTITLEMENTS, PLAN_INFO, PLANES, planMinimoPara, BASE_COMPLETO,
} from './entitlements.ts';

test('accesoProducto: solo con suscripción activa (sin trial)', () => {
  assert.equal(accesoProducto({ subscriptionStatus: 'active' }), true);
  assert.equal(accesoProducto({ subscriptionStatus: 'past_due' }), true); // gracia
  assert.equal(accesoProducto({ subscriptionStatus: 'canceled' }), false);
  assert.equal(accesoProducto({ subscriptionStatus: null }), false);
  assert.equal(accesoProducto({ subscriptionStatus: undefined }), false);
});

test('plan desconocido/ausente cae a BASE', () => {
  // Sin régimen de complementos, el Founding de siempre (lo trae todo).
  assert.deepEqual(entitlementsDe({ plan: null }), BASE_COMPLETO);
  assert.deepEqual(entitlementsDe({ plan: 'RANDOM' }), BASE_COMPLETO);
  assert.deepEqual(entitlementsDe({ plan: 'CADENA' }), PLAN_ENTITLEMENTS.CADENA);
});

test('tieneFeature: exige suscripción activa Y que el plan la incluya', () => {
  const estudioActivo = { plan: 'ESTUDIO', subscriptionStatus: 'active' };
  const baseActivo = { plan: 'BASE', subscriptionStatus: 'active' };
  const estudioSinSub = { plan: 'ESTUDIO', subscriptionStatus: null };

  assert.equal(tieneFeature(estudioActivo, 'gamificacion'), true);
  // Founding Studio lo incluye todo menos varias sedes (decisión del fundador, 15-oct-2026).
  assert.equal(tieneFeature(baseActivo, 'gamificacion'), true);
  assert.equal(tieneFeature(baseActivo, 'multiCentro'), false);
  assert.equal(tieneFeature(estudioSinSub, 'gamificacion'), false); // sin suscripción
  assert.equal(tieneFeature(estudioActivo, 'multiCentro'), false); // solo CADENA
});

test('planMinimoPara: el plan más barato que ya incluye la feature', () => {
  assert.equal(planMinimoPara('gamificacion'), 'BASE');
  assert.equal(planMinimoPara('marketing'), 'BASE');
  // Desde el 19-oct-2026 van de serie en Estudio; en Founding, como complemento.
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

// Lo que distingue Estudio de Founding Studio (fundador, 15-oct-2026: «estudio
// incluye la app alumna»): la app propia del estudio en la tienda de apps.
test('la app propia del estudio: solo Estudio y Cadena, nunca Founding Studio ni el plan gratis', () => {
  assert.equal(PLAN_ENTITLEMENTS.BASE.features.appPropia, false);
  assert.equal(PLAN_ENTITLEMENTS.ESTUDIO.features.appPropia, true);
  assert.equal(PLAN_ENTITLEMENTS.CADENA.features.appPropia, true);
  assert.equal(ENTITLEMENTS_GRATIS.features.appPropia, false);
  assert.equal(planMinimoPara('appPropia'), 'ESTUDIO');
  assert.equal(tieneFeature({ plan: 'BASE', subscriptionStatus: 'gratis' }, 'appPropia'), false);
  assert.equal(tieneFeature({ plan: 'ESTUDIO', subscriptionStatus: 'active' }, 'appPropia'), true);
  // `marca` (la app web con los colores del estudio) sigue en todos.
  for (const p of PLANES) assert.equal(PLAN_ENTITLEMENTS[p].features.marca, true, p);
});
