import { test } from 'node:test';
import assert from 'node:assert/strict';
import { motivoNoAddon } from './addons-reglas.ts';

const ok = { plan: 'BASE', subscriptionStatus: 'active', regimenAddons: true, subscriptionId: 'sub_1', cadenaId: null };

test('Founding con régimen y pagando: puede activar y quitar', () => {
  assert.equal(motivoNoAddon(ok, true), null);
  assert.equal(motivoNoAddon(ok, false), null);
});

test('sede de cadena, sin suscripción, o plan que ya lo trae: no', () => {
  assert.equal(motivoNoAddon({ ...ok, cadenaId: 'cad' }, true), 'cadena');
  assert.equal(motivoNoAddon({ ...ok, subscriptionId: null }, true), 'sin-suscripcion');
  assert.equal(motivoNoAddon({ ...ok, subscriptionStatus: 'gratis' }, true), 'sin-suscripcion');
  assert.equal(motivoNoAddon({ ...ok, plan: 'ESTUDIO' }, true), 'no-hace-falta');
  assert.equal(motivoNoAddon({ ...ok, regimenAddons: false }, true), 'no-hace-falta');
});

test('con un cobro pendiente no se activa nada, pero sí se puede quitar', () => {
  assert.equal(motivoNoAddon({ ...ok, subscriptionStatus: 'past_due' }, true), 'impago');
  assert.equal(motivoNoAddon({ ...ok, subscriptionStatus: 'past_due' }, false), null);
});
