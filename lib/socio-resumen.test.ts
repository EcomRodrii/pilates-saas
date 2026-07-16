import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumenSocio, type ResumenSocioInput } from './socio-resumen.ts';
import type { Socio, Reserva, Recibo, Suscripcion, PlanTarifa, Sesion } from './types.ts';

// Fixtures mínimas (solo los campos que lee resumenSocio); casteadas para TS.
const now = new Date('2026-07-16T12:00:00Z');

const sesiones = [
  { id: 's-past1', inicio: '2026-07-10T10:00:00Z' },
  { id: 's-past2', inicio: '2026-07-14T10:00:00Z' }, // asistida más reciente
  { id: 's-future', inicio: '2026-07-20T10:00:00Z' },
] as unknown as Sesion[];
const sesionById = new Map(sesiones.map(s => [s.id, s]));

const misReservas = [
  { sesionId: 's-past1', estado: 'ASISTIDA' },
  { sesionId: 's-past2', estado: 'ASISTIDA' },
  { sesionId: 's-future', estado: 'CONFIRMADA' },
  { sesionId: 's-past1', estado: 'CANCELADA' },
] as unknown as Reserva[];

const misRecibos = [
  { estado: 'COBRADO', importe: 50 },
  { estado: 'COBRADO', importe: 30 },
  { estado: 'PENDIENTE', importe: 20 },
] as unknown as Recibo[];

const suscripciones = [
  { socioId: 'soc1', estado: 'ACTIVA', planId: 'p1' },
  { socioId: 'soc1', estado: 'CANCELADA', planId: 'p1' },
  { socioId: 'other', estado: 'ACTIVA', planId: 'p1' },
] as unknown as Suscripcion[];

const planesTarifa = [{ id: 'p1', nombre: 'Bono 10' }] as unknown as PlanTarifa[];

const socio = { tags: ['vip'], fechaNacimiento: '1990-03-15' } as unknown as Socio;

const base: ResumenSocioInput = {
  socio, id: 'soc1', misReservas, misRecibos, sesionById, suscripciones, planesTarifa, now,
};

test('resumenSocio: cuenta asistidas, gasto y pendientes', () => {
  const r = resumenSocio(base);
  assert.equal(r.asistidas, 2);
  assert.equal(r.estesMes, 2);
  assert.equal(r.totalGastado, 80);
  assert.equal(r.pendientes.length, 1);
  assert.equal(r.pendientesImporte, 20);
});

test('resumenSocio: próximas reservas = futuras confirmadas', () => {
  const r = resumenSocio(base);
  assert.equal(r.proximasReservas.length, 1);
  assert.equal(r.proximasReservas[0].sesionId, 's-future');
});

test('resumenSocio: diasSinVenir desde la última asistida', () => {
  const r = resumenSocio(base);
  assert.equal(r.diasSinVenir, 2); // 2026-07-14 → 2026-07-16
});

test('resumenSocio: bonos comprados vs activos (aislado por socio)', () => {
  const r = resumenSocio(base);
  assert.equal(r.bonosComprados, 2); // sus1 + sus2 de soc1
  assert.equal(r.bonosActivos, 1);   // solo sus1 ACTIVA
  assert.equal(r.planActivo?.id, 'p1');
});

test('resumenSocio: tags, cumpleaños y sparkline de 12 semanas', () => {
  const r = resumenSocio(base);
  assert.deepEqual(r.tags, ['vip']);
  assert.ok(r.cumpleanos && r.cumpleanos.length > 0);
  assert.equal(r.sparklineWeeks.length, 12);
  assert.equal(r.sparklineWeeks.every(v => typeof v === 'boolean'), true);
});

test('resumenSocio: tolera socio undefined sin romper', () => {
  const r = resumenSocio({ ...base, socio: undefined });
  assert.deepEqual(r.tags, []);
  assert.equal(r.cumpleanos, null);
  assert.equal(r.asistidas, 2); // el resto sigue calculándose
});
