import test from 'node:test';
import assert from 'node:assert/strict';
import { setupFutureUsageCheckout } from './uso-futuro-tarjeta.ts';

// Tabla de verdad de "¿este pago autoriza cargos futuros?" — decide tanto el
// texto legal que Stripe pinta en el Payment Element como si el webhook
// guarda la tarjeta (metodoReutilizableDe exige 'off_session').

test('MENSUAL: la renovación automática necesita la tarjeta off-session', () => {
  assert.equal(setupFutureUsageCheckout('MENSUAL'), 'off_session');
});

test('PUNTUAL (clase suelta): sin cargos futuros, sin texto legal de más', () => {
  assert.equal(setupFutureUsageCheckout('PUNTUAL'), undefined);
});

test('BONO: se consume por sesiones, no se renueva solo', () => {
  assert.equal(setupFutureUsageCheckout('BONO'), undefined);
});
