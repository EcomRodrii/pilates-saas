import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esRegimenAddons, lecturaSuscripcion } from './lectura-suscripcion.ts';

const mapa = {
  plan: (p: string | null | undefined) => (p === 'price_base' ? 'BASE' as const : p === 'price_estudio' ? 'ESTUDIO' as const : null),
  addon: (p: string | null | undefined) => (p === 'price_cdc' ? 'decisiones' as const : p === 'price_sust' ? 'sustituciones' as const : null),
};

test('el plan es la línea de plan, esté donde esté', () => {
  assert.deepEqual(lecturaSuscripcion([{ priceId: 'price_cdc' }, { priceId: 'price_base' }], 'active', mapa), { plan: 'BASE', addons: ['decisiones'] });
});

test('varias líneas de complemento, sin repetir; lo desconocido no cuenta', () => {
  const r = lecturaSuscripcion([{ priceId: 'price_base' }, { priceId: 'price_sust' }, { priceId: 'price_sust' }, { priceId: 'price_otro' }], 'active', mapa);
  assert.deepEqual(r, { plan: 'BASE', addons: ['sustituciones'] });
});

test('una suscripción terminada no deja complementos', () => {
  assert.deepEqual(lecturaSuscripcion([{ priceId: 'price_base' }, { priceId: 'price_cdc' }], 'canceled', mapa).addons, []);
  // past_due sigue (periodo de gracia, como el plan).
  assert.deepEqual(lecturaSuscripcion([{ priceId: 'price_base' }, { priceId: 'price_cdc' }], 'past_due', mapa).addons, ['decisiones']);
});

test('sin línea de plan, plan null (el webhook cae a la metadata)', () => {
  assert.equal(lecturaSuscripcion([{ priceId: 'price_cdc' }], 'active', mapa).plan, null);
});

test('régimen solo con la metadata exacta', () => {
  assert.equal(esRegimenAddons({ regimen: 'addons' }), true);
  assert.equal(esRegimenAddons({ plan: 'BASE' }), false);
  assert.equal(esRegimenAddons(null), false);
});
