import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { itemsParaPasarAEstudio, motivoNoCambioPlan } from './cambio-plan-reglas.ts';

const ok = { plan: 'BASE', subscriptionStatus: 'active', subscriptionId: 'sub_1', cadenaId: null };

test('Founding pagando: puede pasar a Estudio', () => {
  assert.equal(motivoNoCambioPlan(ok, 'ESTUDIO'), null);
  assert.equal(motivoNoCambioPlan({ ...ok, subscriptionStatus: 'trialing' }, 'ESTUDIO'), null);
});

test('solo hacia Estudio: bajar o ir a Cadena va por otro camino', () => {
  assert.equal(motivoNoCambioPlan(ok, 'BASE'), 'destino');
  assert.equal(motivoNoCambioPlan(ok, 'CADENA'), 'destino');
  assert.equal(motivoNoCambioPlan(ok, 'cualquier cosa'), 'destino');
  assert.equal(motivoNoCambioPlan({ ...ok, plan: 'CADENA' }, 'ESTUDIO'), 'destino');
});

test('sede de cadena, sin suscripción, con impago o ya en Estudio: no', () => {
  assert.equal(motivoNoCambioPlan({ ...ok, cadenaId: 'cad' }, 'ESTUDIO'), 'cadena');
  assert.equal(motivoNoCambioPlan({ ...ok, subscriptionId: null }, 'ESTUDIO'), 'sin-suscripcion');
  assert.equal(motivoNoCambioPlan({ ...ok, subscriptionStatus: 'gratis' }, 'ESTUDIO'), 'sin-suscripcion');
  assert.equal(motivoNoCambioPlan({ ...ok, subscriptionStatus: 'canceled' }, 'ESTUDIO'), 'sin-suscripcion');
  assert.equal(motivoNoCambioPlan({ ...ok, subscriptionStatus: 'past_due' }, 'ESTUDIO'), 'impago');
  assert.equal(motivoNoCambioPlan({ ...ok, plan: 'ESTUDIO' }, 'ESTUDIO'), 'ya-lo-tiene');
});

const PRECIOS: Record<string, 'BASE' | 'ESTUDIO' | 'CADENA'> = { price_base: 'BASE', price_estudio: 'ESTUDIO', price_cadena: 'CADENA' };
const mapa = {
  plan: (p: string | null | undefined) => (p ? PRECIOS[p] ?? null : null),
  esAddon: (p: string | null | undefined) => !!p && p.startsWith('price_addon_'),
};

test('una sola actualización: la línea del plan pasa a Estudio y los complementos se borran', () => {
  const items = itemsParaPasarAEstudio([
    { id: 'si_addon1', priceId: 'price_addon_decisiones' },
    { id: 'si_plan', priceId: 'price_base' },
    { id: 'si_addon2', priceId: 'price_addon_ia' },
  ], 'price_estudio', mapa);
  assert.deepEqual(items, [
    { id: 'si_plan', price: 'price_estudio' },
    { id: 'si_addon1', deleted: true },
    { id: 'si_addon2', deleted: true },
  ]);
});

test('sin complementos: solo cambia el precio del plan; una línea desconocida no se toca', () => {
  assert.deepEqual(itemsParaPasarAEstudio([{ id: 'si_plan', priceId: 'price_base' }, { id: 'si_x', priceId: 'price_otro' }], 'price_estudio', mapa),
    [{ id: 'si_plan', price: 'price_estudio' }]);
});

test('lo manda Stripe: si la suscripción no es de Founding (o no se entiende), no se toca', () => {
  assert.equal(itemsParaPasarAEstudio([{ id: 'si', priceId: 'price_estudio' }], 'price_estudio', mapa), null);
  assert.equal(itemsParaPasarAEstudio([{ id: 'si', priceId: 'price_otro' }], 'price_estudio', mapa), null);
  assert.equal(itemsParaPasarAEstudio([], 'price_estudio', mapa), null);
  assert.equal(itemsParaPasarAEstudio([{ id: 'a', priceId: 'price_base' }, { id: 'b', priceId: 'price_base' }], 'price_estudio', mapa), null);
});

test('la ruta: solo la propietaria, guardia de modo, cerrojo, decide con Stripe y guarda lo que Stripe tiene', () => {
  const ruta = readFileSync(join(import.meta.dirname, '..', '..', 'app/api/billing/cambiar-plan/route.ts'), 'utf8');
  assert.match(ruta, /sesion\.rol !== 'PROPIETARIO'/);
  assert.match(ruta, /comprobarModoStripe\(\)/);
  assert.match(ruta, /reclamarCheckoutLock/);
  assert.match(ruta, /liberarCheckoutLock/);
  assert.match(ruta, /itemsParaPasarAEstudio\(/);
  assert.match(ruta, /idempotencyKey: `plan-\$\{subId\}-ESTUDIO-/);
  // Tras cambiar, se vuelve a leer Stripe y se exige el resultado pedido.
  assert.match(ruta, /const despues = await stripe\.subscriptions\.retrieve\(subId\)/);
  assert.match(ruta, /lectura\.plan !== 'ESTUDIO' \|\| lectura\.addons\.length > 0/);
});
