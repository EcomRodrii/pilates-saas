import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  enriquecerSesiones, ocultarImporteSiCorresponde, filtrarSesionesPorRol,
} from './calendario-datos.ts';
import type { Sesion } from './types.ts';

const sesion = (o: Partial<Sesion> & Pick<Sesion, 'id' | 'instructorId'>): Sesion => ({
  studioId: 'e1', tipoClaseId: 'tc1', salaId: 'sala1', inicio: '2026-07-13T08:00:00Z',
  fin: '2026-07-13T09:00:00Z', aforoMaximo: 8, cancelada: false, notas: null,
  precioPuntual: 15, ...o,
});

// ── enriquecerSesiones ───────────────────────────────────────────────────────

test('enriquecerSesiones: sin sustitución → sustitucionAbierta false, motivoBaja null', () => {
  const [r] = enriquecerSesiones([sesion({ id: 's1', instructorId: 'julia' })], []);
  assert.equal(r.sustitucionAbierta, false);
  assert.equal(r.motivoBaja, null);
});

test('enriquecerSesiones: sustitución en estado "buscando" → abierta, con motivo y su id', () => {
  const [r] = enriquecerSesiones(
    [sesion({ id: 's1', instructorId: 'julia' })],
    [{ id: 'sus-1', sesion_id: 's1', estado: 'buscando', motivo: 'Gripe' }],
  );
  assert.equal(r.sustitucionAbierta, true);
  assert.equal(r.motivoBaja, 'Gripe');
  assert.equal(r.sustitucionId, 'sus-1');
});

test('enriquecerSesiones: sustitución "confirmada" NO cuenta como abierta (ya tiene sustituta)', () => {
  const [r] = enriquecerSesiones(
    [sesion({ id: 's1', instructorId: 'maria' })],
    [{ id: 'sus-1', sesion_id: 's1', estado: 'confirmada', motivo: 'Gripe' }],
  );
  assert.equal(r.sustitucionAbierta, false);
  assert.equal(r.motivoBaja, null);
});

test('enriquecerSesiones: "cancelada"/"resuelta_fuera"/"sin_sustituta" tampoco cuentan como abiertas', () => {
  for (const estado of ['cancelada', 'resuelta_fuera', 'sin_sustituta']) {
    const [r] = enriquecerSesiones(
      [sesion({ id: 's1', instructorId: 'maria' })],
      [{ id: 'sus-1', sesion_id: 's1', estado, motivo: 'x' }],
    );
    assert.equal(r.sustitucionAbierta, false, `estado ${estado} no debería contar como abierta`);
  }
});

test('enriquecerSesiones: una sustitución de OTRA sesión no contamina esta', () => {
  const [r] = enriquecerSesiones(
    [sesion({ id: 's1', instructorId: 'julia' })],
    [{ id: 'sus-1', sesion_id: 'otra-sesion', estado: 'buscando', motivo: 'Gripe' }],
  );
  assert.equal(r.sustitucionAbierta, false);
});

// ── Los tres roles reciben payloads distintos ───────────────────────────────

test('PROPIETARIO: ve el importe y todas las sesiones del estudio', () => {
  const enr = enriquecerSesiones(
    [sesion({ id: 's1', instructorId: 'julia' }), sesion({ id: 's2', instructorId: 'maria' })],
    [],
  );
  const conImporte = ocultarImporteSiCorresponde(enr, 'PROPIETARIO');
  const finales = filtrarSesionesPorRol(conImporte, 'PROPIETARIO', null);
  assert.equal(finales.length, 2);
  assert.ok(finales.every(s => s.precioPuntual === 15));
});

test('RECEPCION: SÍ ve el importe (cobra en mostrador, puedeMoverDinero la incluye)', () => {
  // Se confirma aquí explícitamente en vez de asumirlo, para que un cambio en
  // permisos-reglas.ts rompa este test en vez de colar en silencio.
  const enr = enriquecerSesiones([sesion({ id: 's1', instructorId: 'julia' })], []);
  const conImporte = ocultarImporteSiCorresponde(enr, 'RECEPCION');
  assert.equal(conImporte[0].precioPuntual, 15);
});

test('INSTRUCTOR: solo ve sus propias sesiones, y sin importe', () => {
  const enr = enriquecerSesiones(
    [sesion({ id: 's1', instructorId: 'julia' }), sesion({ id: 's2', instructorId: 'maria' })],
    [],
  );
  const sinImporte = ocultarImporteSiCorresponde(enr, 'INSTRUCTOR');
  assert.ok(sinImporte.every(s => s.precioPuntual === null));

  const soloSuyas = filtrarSesionesPorRol(sinImporte, 'INSTRUCTOR', 'julia');
  assert.equal(soloSuyas.length, 1);
  assert.equal(soloSuyas[0].id, 's1');
});

test('INSTRUCTOR sin ficha resuelta (instructorId null) no ve ninguna sesión, no todas', () => {
  const enr = enriquecerSesiones([sesion({ id: 's1', instructorId: 'julia' })], []);
  const finales = filtrarSesionesPorRol(enr, 'INSTRUCTOR', null);
  assert.equal(finales.length, 0);
});

test('MANAGER: mismo contrato que PROPIETARIO para sesiones (ve todas)', () => {
  const enr = enriquecerSesiones(
    [sesion({ id: 's1', instructorId: 'julia' }), sesion({ id: 's2', instructorId: 'maria' })],
    [],
  );
  const finales = filtrarSesionesPorRol(enr, 'MANAGER', null);
  assert.equal(finales.length, 2);
});
