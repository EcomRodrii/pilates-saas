import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ADDONS, BASE_COMPLETO, ENTITLEMENTS_GRATIS, LISTA_ADDONS, PLAN_ENTITLEMENTS,
  addonDeFeature, entitlementsDe, pagaAddonsAparte, planDeFila, precioMensual, tieneFeature,
} from './entitlements.ts';

const nuevo = { plan: 'BASE', subscriptionStatus: 'active', regimenAddons: true } as const;

test('Founding de antes (sin régimen) lo conserva todo', () => {
  const e = entitlementsDe({ plan: 'BASE', subscriptionStatus: 'active' });
  assert.deepEqual(e, BASE_COMPLETO);
  for (const f of ['decisiones', 'sustitucionesAutonomas', 'ia'] as const) assert.equal(e.features[f], true, f);
  // Lo mismo si la consulta no leyó las columnas nuevas (fallo menos malo).
  assert.equal(tieneFeature({ plan: 'BASE', subscriptionStatus: 'active', regimenAddons: null }, 'decisiones'), true);
});

test('Founding nuevo sin complementos: núcleo, sin los tres', () => {
  for (const f of ['decisiones', 'sustitucionesAutonomas', 'ia'] as const) assert.equal(tieneFeature(nuevo, f), false, f);
  // Lo que no es complemento sigue: asistente, marca, marketing, gamificación.
  for (const f of ['asistente', 'marca', 'marketing', 'gamificacion'] as const) assert.equal(tieneFeature(nuevo, f), true, f);
});

test('cada complemento enciende SOLO lo suyo', () => {
  for (const a of LISTA_ADDONS) {
    const e = entitlementsDe({ ...nuevo, addons: [a] });
    for (const otro of LISTA_ADDONS) {
      for (const f of ADDONS[otro].features) assert.equal(e.features[f], otro === a, `${a} → ${f}`);
    }
  }
  // Un id desconocido no enciende nada.
  assert.equal(tieneFeature({ ...nuevo, addons: ['todo'] }, 'decisiones'), false);
});

test('gratis y prueba lo tienen todo; Estudio y Cadena también', () => {
  assert.equal(entitlementsDe({ plan: 'BASE', subscriptionStatus: 'gratis', regimenAddons: true }), ENTITLEMENTS_GRATIS);
  assert.equal(tieneFeature({ plan: 'BASE', subscriptionStatus: 'trialing' }, 'decisiones'), true);
  for (const plan of ['ESTUDIO', 'CADENA'] as const) {
    assert.equal(pagaAddonsAparte({ plan, subscriptionStatus: 'active', regimenAddons: true }), false);
    assert.equal(tieneFeature({ plan, subscriptionStatus: 'active', regimenAddons: true }, 'decisiones'), true);
  }
});

test('sin suscripción activa, ni con el complemento', () => {
  assert.equal(tieneFeature({ ...nuevo, subscriptionStatus: 'canceled', addons: ['decisiones'] }, 'decisiones'), false);
});

test('la tabla de Founding es la oferta nueva; los planes de arriba lo traen todo', () => {
  for (const a of LISTA_ADDONS) for (const f of ADDONS[a].features) {
    assert.equal(PLAN_ENTITLEMENTS.BASE.features[f], false, `BASE ${f}`);
    assert.equal(PLAN_ENTITLEMENTS.ESTUDIO.features[f], true, `ESTUDIO ${f}`);
    assert.equal(addonDeFeature(f), a);
  }
  assert.equal(addonDeFeature('marca'), null);
});

test('planDeFila mapea las columnas de studios', () => {
  assert.deepEqual(planDeFila({ plan: 'BASE', subscription_status: 'active', regimen_addons: true, addons: ['ia'] }),
    { plan: 'BASE', subscriptionStatus: 'active', regimenAddons: true, addons: ['ia'] });
  assert.deepEqual(planDeFila(null), { plan: null, subscriptionStatus: null, regimenAddons: null, addons: null });
});

test('los ids de complemento son los del CHECK de la migración', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261019175741_complementos_founding.sql', import.meta.url), 'utf8');
  const m = sql.match(/addons <@ array\[([^\]]+)\]/);
  assert.ok(m);
  assert.deepEqual(m[1].split(',').map((x) => x.trim().replace(/'/g, '')), LISTA_ADDONS);
});

test('el total del mes: 29 € más lo contratado (el ejemplo del fundador, 35 €)', () => {
  assert.equal(precioMensual('BASE', []), 29);
  assert.equal(precioMensual('BASE', ['sustituciones']), 35);
  assert.equal(precioMensual('BASE', ['decisiones', 'ia', 'sustituciones', 'basura']), 53);
});
