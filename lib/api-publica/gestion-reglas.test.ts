import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarNuevaClave, expiraTrasRotar, caducidadDesde, estadoClave } from './gestion-reglas.ts';
import { scopesQuePuedeConceder } from './scopes.ts';

const PROPIETARIA = scopesQuePuedeConceder('PROPIETARIO');

test('una clave válida sale con los permisos en el orden del catálogo, sin repetir', () => {
  const v = validarNuevaClave({ nombre: '  Contabilidad ', scopes: ['facturas:leer', 'pagos:leer', 'pagos:leer'], caducaEnDias: 90 }, PROPIETARIA);
  assert.deepEqual(v, { ok: true, valor: { nombre: 'Contabilidad', scopes: ['pagos:leer', 'facturas:leer'], caducaEnDias: 90 } });
});

test('no nace una clave con más de lo que puede dar quien la crea', () => {
  const v = validarNuevaClave({ nombre: 'x', scopes: ['pagos:leer'] }, scopesQuePuedeConceder('MANAGER'));
  assert.equal(v.ok, false);
});

test('rechaza lo que no tiene sentido', () => {
  assert.equal(validarNuevaClave({ nombre: '', scopes: ['pagos:leer'] }, PROPIETARIA).ok, false);
  assert.equal(validarNuevaClave({ nombre: 'x', scopes: [] }, PROPIETARIA).ok, false);
  assert.equal(validarNuevaClave({ nombre: 'x', scopes: ['pagos:escribir'] }, PROPIETARIA).ok, false);
  assert.equal(validarNuevaClave({ nombre: 'x', scopes: ['pagos:leer'], caducaEnDias: 7 }, PROPIETARIA).ok, false);
  assert.equal(validarNuevaClave(null, PROPIETARIA).ok, false);
});

test('rotar deja la vieja 24 h, sin alargarle nunca la vida', () => {
  const ahora = new Date('2026-10-01T10:00:00Z');
  assert.equal(expiraTrasRotar(ahora, null), '2026-10-02T10:00:00.000Z');
  assert.equal(expiraTrasRotar(ahora, '2026-10-01T12:00:00.000Z'), '2026-10-01T12:00:00.000Z');
  assert.equal(caducidadDesde(ahora, null), null);
  assert.equal(caducidadDesde(ahora, 30), '2026-10-31T10:00:00.000Z');
});

test('estado de una clave', () => {
  const ahora = new Date('2026-10-01T10:00:00Z');
  assert.equal(estadoClave({ revocada_en: null, expira_en: null }, ahora), 'activa');
  assert.equal(estadoClave({ revocada_en: null, expira_en: '2026-10-01T09:00:00Z' }, ahora), 'caducada');
  assert.equal(estadoClave({ revocada_en: '2026-09-01T00:00:00Z', expira_en: null }, ahora), 'revocada');
});
