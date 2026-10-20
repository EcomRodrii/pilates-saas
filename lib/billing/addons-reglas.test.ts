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

test('la ruta de complementos no manda una clave de idempotencia atada a las líneas', async () => {
  // Activar → quitar → activar deja las mismas líneas que la primera vez: con esa clave
  // Stripe devolvía la respuesta guardada SIN crear la línea (medido el 20-oct-2026,
  // «No se ha podido aplicar el cambio» durante 24 h). Lo que evita el doble clic es el
  // cerrojo y volver a leer las líneas antes de crear.
  const { readFileSync } = await import('node:fs');
  const ruta = readFileSync(new URL('../../app/api/billing/addons/route.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(ruta, /idempotencyKey/);
  assert.match(ruta, /reclamarCheckoutLock/);
  assert.match(ruta, /if \(activar && !linea\)/);
});
