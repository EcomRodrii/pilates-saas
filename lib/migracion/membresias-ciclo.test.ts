import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cicloDeMembresiaImportada, finDelCicloVigente } from './membresias-ciclo.ts';

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

const mensual = { tipo: 'MENSUAL' as const, sesiones: null, validezDias: null };

test('cuota MENSUAL ACTIVA sin fecha de fin: entra con el final de su ciclo vigente y se renueva sola desde ahí', () => {
  const r = cicloDeMembresiaImportada({ ...base, plan: mensual, fechaInicio: '2024-03-15' });
  assert.equal(r.fechaFin, '2026-10-15', 'el primer aniversario mensual que no ha pasado');
  assert.equal(r.estado, 'ACTIVA');
  assert.equal(r.caducada, false);
  assert.equal(r.cuotaConRenovacion, true);
  assert.equal(r.sesionesRestantes, null);
});

test('cuota trimestral: los ciclos son de 3 meses', () => {
  const r = cicloDeMembresiaImportada({ ...base, plan: { ...mensual, periodicidadMeses: 3 }, fechaInicio: '2026-01-10' });
  assert.equal(r.fechaFin, '2026-10-10');
});

test('cuota que empieza hoy o más adelante: el final de su primer ciclo', () => {
  assert.equal(cicloDeMembresiaImportada({ ...base, plan: mensual, fechaInicio: '2026-10-09' }).fechaFin, '2026-11-09');
  assert.equal(cicloDeMembresiaImportada({ ...base, plan: mensual, fechaInicio: '2026-12-01' }).fechaFin, '2027-01-01');
});

test('el día 31 no desborda al mes siguiente', () => {
  assert.equal(finDelCicloVigente('2026-01-31', '2026-02-10', 1), '2026-02-28');
  assert.equal(finDelCicloVigente('2026-01-31', '2026-03-01', 1), '2026-03-31');
});

test('cuota pausada, cancelada o con fecha en el archivo: no se inventa nada', () => {
  assert.equal(cicloDeMembresiaImportada({ ...base, plan: mensual, fechaInicio: '2024-03-15', estadoArchivo: 'PAUSADA' }).fechaFin, null);
  const conFecha = cicloDeMembresiaImportada({ ...base, plan: mensual, fechaInicio: '2024-03-15', fechaFinArchivo: '2026-11-01' });
  assert.equal(conFecha.fechaFin, '2026-11-01');
  assert.equal(conFecha.cuotaConRenovacion, false);
});

test('un estado del archivo distinto de ACTIVA se respeta tal cual', () => {
  const r = cicloDeMembresiaImportada({ ...base, plan: bono180, fechaInicio: '2024-11-12', estadoArchivo: 'CANCELADA' });
  assert.equal(r.estado, 'CANCELADA');
  assert.equal(r.caducada, false);
});
