import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cicloDeMembresiaImportada } from './membresias-ciclo.ts';

const bono180 = { tipo: 'BONO' as const, sesiones: 20, validezDias: 180 };
const hoy = '2026-10-09';
const base = { fechaFinArchivo: null, estadoArchivo: null, saldoArchivo: null, hoy };

test('bono de nov-2024 con 180 días: fecha de fin calculada y entra EXPIRADA, sin saldo inventado', () => {
  const r = cicloDeMembresiaImportada({ ...base, plan: bono180, fechaInicio: '2024-11-12' });
  assert.equal(r.fechaFin, '2025-05-11');
  assert.equal(r.estado, 'EXPIRADA');
  assert.equal(r.caducada, true);
  assert.equal(r.sesionesRestantes, null);
});

test('bono reciente sigue ACTIVA con su fin y su saldo completo', () => {
  const r = cicloDeMembresiaImportada({ ...base, plan: bono180, fechaInicio: '2026-09-20' });
  assert.equal(r.estado, 'ACTIVA');
  assert.equal(r.fechaFin, '2027-03-19');
  assert.equal(r.sesionesRestantes, 20);
});

test('la fecha de fin del archivo manda sobre la del plan', () => {
  const r = cicloDeMembresiaImportada({ ...base, plan: bono180, fechaInicio: '2024-11-12', fechaFinArchivo: '2027-01-01' });
  assert.equal(r.fechaFin, '2027-01-01');
  assert.equal(r.estado, 'ACTIVA');
});

test('el saldo del archivo se respeta, aunque la caduque (no se consume nada)', () => {
  const r = cicloDeMembresiaImportada({ ...base, plan: bono180, fechaInicio: '2024-11-12', saldoArchivo: 4 });
  assert.equal(r.estado, 'EXPIRADA');
  assert.equal(r.sesionesRestantes, 4);
});

test('un bono sin validez en la tarifa no caduca nunca (como siempre)', () => {
  const r = cicloDeMembresiaImportada({ ...base, plan: { tipo: 'BONO', sesiones: 10, validezDias: null }, fechaInicio: '2024-01-01' });
  assert.equal(r.fechaFin, null);
  assert.equal(r.estado, 'ACTIVA');
});

test('una cuota MENSUAL sin fecha de fin no se toca (no se inventa «inicio + 1 mes»)', () => {
  const r = cicloDeMembresiaImportada({ ...base, plan: { tipo: 'MENSUAL', sesiones: null, validezDias: null }, fechaInicio: '2024-03-01' });
  assert.equal(r.fechaFin, null);
  assert.equal(r.estado, 'ACTIVA');
  assert.equal(r.sesionesRestantes, null);
});

test('un estado del archivo distinto de ACTIVA se respeta tal cual', () => {
  const r = cicloDeMembresiaImportada({ ...base, plan: bono180, fechaInicio: '2024-11-12', estadoArchivo: 'CANCELADA' });
  assert.equal(r.estado, 'CANCELADA');
  assert.equal(r.caducada, false);
});
