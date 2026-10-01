import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarNuevaClave, expiraTrasRotar, caducidadDesde, estadoClave, filtroClaves, filtroClavesQueLleganA } from './gestion-reglas.ts';
import { scopesQuePuedeConceder } from './scopes.ts';

const PROPIETARIA = scopesQuePuedeConceder('PROPIETARIO');

test('una clave válida sale con los permisos en el orden del catálogo, sin repetir', () => {
  const v = validarNuevaClave({ nombre: '  Contabilidad ', scopes: ['facturas:leer', 'pagos:leer', 'pagos:leer'], caducaEnDias: 90 }, PROPIETARIA);
  assert.deepEqual(v, { ok: true, valor: { nombre: 'Contabilidad', scopes: ['pagos:leer', 'facturas:leer'], caducaEnDias: 90, alcance: 'sede' } });
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

test('el alcance de una clave: de la sede por defecto, de la cadena si se pide, nada más', () => {
  const base = { nombre: 'Contabilidad', scopes: ['pagos:leer'] };
  const sinDecir = validarNuevaClave(base, PROPIETARIA);
  assert.equal(sinDecir.ok && sinDecir.valor.alcance, 'sede');
  const deCadena = validarNuevaClave({ ...base, alcance: 'cadena' }, PROPIETARIA);
  assert.equal(deCadena.ok && deCadena.valor.alcance, 'cadena');
  assert.equal(validarNuevaClave({ ...base, alcance: 'todas' }, PROPIETARIA).ok, false);
});

const UID = '00000000-0000-4000-8000-000000000001';

test('desde el panel de una sede: las claves de la sede, las de su cadena si es la dueña, y las de cadena que creó ella', () => {
  assert.equal(filtroClaves({ studioId: 'studio-a', cadenaId: 'cadena-1', userId: UID }),
    `and(studio_id.eq.studio-a,cadena_id.is.null),cadena_id.eq.cadena-1,and(studio_id.eq.studio-a,creada_por.eq.${UID})`);
});

test('otra propietaria de la sede no ve ni revoca la clave de cadena que creó la dueña allí', () => {
  // Sin `cadenaId` (no es la dueña de la cadena), una clave de cadena con
  // studio_id = esta sede solo entra si la creó ella: la rama de la sede exige
  // `cadena_id is null`.
  const f = filtroClaves({ studioId: 'studio-a', cadenaId: null, userId: UID });
  assert.equal(f, `and(studio_id.eq.studio-a,cadena_id.is.null),and(studio_id.eq.studio-a,creada_por.eq.${UID})`);
  assert.doesNotMatch(f, /(^|,)studio_id\.eq\.studio-a(,|$)/);
});

test('un id raro nunca entra en un filtro de texto: se para, no se ignora', () => {
  assert.throws(() => filtroClaves({ studioId: 'a,b', cadenaId: null, userId: UID }));
  assert.throws(() => filtroClaves({ studioId: 'studio-a', cadenaId: 'x,studio_id.neq.y', userId: UID }));
  assert.throws(() => filtroClaves({ studioId: 'studio-a', cadenaId: null, userId: 'x)' }));
  assert.throws(() => filtroClavesQueLleganA({ studioId: 'studio-a', cadenaId: 'x,y' }));
});

test('/interno, al desactivar la API de una sede, corta todo lo que llega a ella: sus claves y las de su cadena', () => {
  assert.equal(filtroClavesQueLleganA({ studioId: 'studio-a', cadenaId: null }), 'studio_id.eq.studio-a');
  assert.equal(filtroClavesQueLleganA({ studioId: 'studio-a', cadenaId: 'cadena-1' }), 'studio_id.eq.studio-a,cadena_id.eq.cadena-1');
});
