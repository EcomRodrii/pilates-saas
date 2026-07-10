// Tests de la lógica de consumo de bono. Runner nativo de Node: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Suscripcion, PlanTarifa } from '@/lib/types';
import { bonoConsumible, calcularConsumoBono, calcularDevolucionBono, tieneEntitlementActivo } from './bono-logic.ts';

// ── Fixtures ─────────────────────────────────────────────────────────────────
function sus(p: Partial<Suscripcion> & Pick<Suscripcion, 'socioId' | 'planId'>): Suscripcion {
  return {
    id: 'sus-1', studioId: 'e1', estado: 'ACTIVA',
    fechaInicio: '2026-01-01', fechaFin: null, sesionesRestantes: 5, stripeSubscriptionId: null, ...p,
  };
}
function plan(p: Partial<PlanTarifa> & Pick<PlanTarifa, 'id' | 'tipo'>): PlanTarifa {
  return { studioId: 'e1', nombre: 'Bono 10', descripcion: null, precio: 100, sesiones: 10, activo: true, ...p };
}

// ── bonoConsumible ───────────────────────────────────────────────────────────
test('bonoConsumible devuelve la suscripción de un plan BONO activo', () => {
  const suscripciones = [sus({ socioId: 'a', planId: 'p1', sesionesRestantes: 3 })];
  const planes = [plan({ id: 'p1', tipo: 'BONO' })];
  const r = bonoConsumible('a', suscripciones, planes);
  assert.equal(r?.sesionesRestantes, 3);
  assert.equal(r?.plan.id, 'p1');
});

test('bonoConsumible null si no hay suscripción activa', () => {
  const suscripciones = [sus({ socioId: 'a', planId: 'p1', estado: 'CANCELADA' })];
  assert.equal(bonoConsumible('a', suscripciones, [plan({ id: 'p1', tipo: 'BONO' })]), null);
});

test('bonoConsumible null si el plan es MENSUAL (no de sesiones)', () => {
  const suscripciones = [sus({ socioId: 'a', planId: 'p1' })];
  assert.equal(bonoConsumible('a', suscripciones, [plan({ id: 'p1', tipo: 'MENSUAL' })]), null);
});

test('bonoConsumible null si sesionesRestantes es null (saldo no gestionado por sesiones)', () => {
  const suscripciones = [sus({ socioId: 'a', planId: 'p1', sesionesRestantes: null })];
  assert.equal(bonoConsumible('a', suscripciones, [plan({ id: 'p1', tipo: 'BONO' })]), null);
});

test('bonoConsumible acepta plan PUNTUAL', () => {
  const suscripciones = [sus({ socioId: 'a', planId: 'p1', sesionesRestantes: 1 })];
  assert.ok(bonoConsumible('a', suscripciones, [plan({ id: 'p1', tipo: 'PUNTUAL' })]));
});

// ── calcularConsumoBono ──────────────────────────────────────────────────────
test('calcularConsumoBono descuenta una sesión', () => {
  assert.deepEqual(calcularConsumoBono(3), { nuevasRestantes: 2, agotado: false });
});

test('calcularConsumoBono marca agotado al llegar a 0', () => {
  assert.deepEqual(calcularConsumoBono(1), { nuevasRestantes: 0, agotado: true });
});

test('calcularConsumoBono nunca baja de 0', () => {
  assert.deepEqual(calcularConsumoBono(0), { nuevasRestantes: 0, agotado: true });
});

// ── calcularDevolucionBono ───────────────────────────────────────────────────
test('calcularDevolucionBono suma una sesión', () => {
  assert.equal(calcularDevolucionBono(2, 10), 3);
});

test('calcularDevolucionBono no supera el total del plan', () => {
  assert.equal(calcularDevolucionBono(10, 10), 10);
});

test('calcularDevolucionBono sin tope de plan (sesiones null) suma sin límite', () => {
  assert.equal(calcularDevolucionBono(99, null), 100);
});

// ── tieneEntitlementActivo (C-4) ──────────────────────────────────────────────
const HOY = '2026-07-10';

test('tieneEntitlementActivo: bono ACTIVO con sesiones restantes → true', () => {
  const s = [sus({ socioId: 'a', planId: 'p1', sesionesRestantes: 3 })];
  assert.equal(tieneEntitlementActivo('a', s, [plan({ id: 'p1', tipo: 'BONO' })], HOY), true);
});

test('tieneEntitlementActivo: bono ACTIVO sin sesiones (0) → false', () => {
  const s = [sus({ socioId: 'a', planId: 'p1', sesionesRestantes: 0 })];
  assert.equal(tieneEntitlementActivo('a', s, [plan({ id: 'p1', tipo: 'BONO' })], HOY), false);
});

test('tieneEntitlementActivo: mensual vigente (fin futuro) → true', () => {
  const s = [sus({ socioId: 'a', planId: 'p1', fechaFin: '2026-08-01', sesionesRestantes: null })];
  assert.equal(tieneEntitlementActivo('a', s, [plan({ id: 'p1', tipo: 'MENSUAL' })], HOY), true);
});

test('tieneEntitlementActivo: mensual sin fecha fin → true', () => {
  const s = [sus({ socioId: 'a', planId: 'p1', fechaFin: null, sesionesRestantes: null })];
  assert.equal(tieneEntitlementActivo('a', s, [plan({ id: 'p1', tipo: 'MENSUAL' })], HOY), true);
});

test('tieneEntitlementActivo: mensual caducado (fin pasado) → false', () => {
  const s = [sus({ socioId: 'a', planId: 'p1', fechaFin: '2026-07-01', sesionesRestantes: null })];
  assert.equal(tieneEntitlementActivo('a', s, [plan({ id: 'p1', tipo: 'MENSUAL' })], HOY), false);
});

test('tieneEntitlementActivo: suscripción no ACTIVA → false', () => {
  const s = [sus({ socioId: 'a', planId: 'p1', estado: 'PAUSADA', sesionesRestantes: 5 })];
  assert.equal(tieneEntitlementActivo('a', s, [plan({ id: 'p1', tipo: 'BONO' })], HOY), false);
});

test('tieneEntitlementActivo: sin suscripción → false', () => {
  assert.equal(tieneEntitlementActivo('a', [], [], HOY), false);
});

test('tieneEntitlementActivo: cuenta solo la suscripción de la socia indicada', () => {
  const s = [sus({ socioId: 'otra', planId: 'p1', sesionesRestantes: 5 })];
  assert.equal(tieneEntitlementActivo('a', s, [plan({ id: 'p1', tipo: 'BONO' })], HOY), false);
});
