import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  claveDeCadenaLlega, leerEstudioPedido, resolverSede, sedesAlcanzables, type SedeDeCadena,
} from './cadena.ts';

const sede = { estudioId: 'studio-a', cadenaId: null };
const cadena = { estudioId: 'studio-a', cadenaId: 'cadena-1' };

test('la cabecera Tentare-Estudio: sin ella null, con forma de id la sede, lo demás inválido', () => {
  assert.equal(leerEstudioPedido(null), null);
  assert.equal(leerEstudioPedido(undefined), null);
  assert.equal(leerEstudioPedido(' studio-b '), 'studio-b');
  assert.equal(leerEstudioPedido(''), 'invalido');
  assert.equal(leerEstudioPedido('studio b'), 'invalido');
  assert.equal(leerEstudioPedido("studio-b',x"), 'invalido');
  assert.equal(leerEstudioPedido('x'.repeat(101)), 'invalido');
});

test('una credencial de una sede: sin cabecera o con la suya, su sede; con otra, 404 (sin decir si existe)', () => {
  assert.deepEqual(resolverSede(sede, null, false), { ok: true, studioId: 'studio-a', deCadena: false });
  assert.deepEqual(resolverSede(sede, 'studio-a', false), { ok: true, studioId: 'studio-a', deCadena: false });
  const otra = resolverSede(sede, 'studio-b', false);
  assert.equal(otra.ok, false);
  assert.equal(!otra.ok && otra.status, 404);
  // Ni siquiera en /estudios.
  assert.equal(resolverSede(sede, 'studio-b', true).ok, false);
});

test('una clave de cadena sin cabecera no lee nada: 400 que dice cómo pedir la sede', () => {
  const r = resolverSede(cadena, null, false);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.status, 400);
  assert.match(!r.ok ? r.mensaje : '', /Tentare-Estudio/);
  assert.match(!r.ok ? r.mensaje : '', /\/api\/v1\/estudios/);
});

test('una clave de cadena: con cabecera, esa sede (por comprobar); en /estudios sin cabecera, su origen', () => {
  assert.deepEqual(resolverSede(cadena, 'studio-b', false), { ok: true, studioId: 'studio-b', deCadena: true });
  assert.deepEqual(resolverSede(cadena, null, true), { ok: true, studioId: 'studio-a', deCadena: true });
});

test('una cabecera mal formada es 400 para cualquier credencial', () => {
  for (const a of [sede, cadena]) {
    const r = resolverSede(a, 'invalido', true);
    assert.equal(!r.ok && r.status, 400);
  }
});

const DUENA = 'uid-duena';

test('la clave de cadena llega solo a sedes de SU cadena de las que quien la creó es dueña', () => {
  const base = { cadenaId: 'cadena-1', duenaCadena: DUENA, creadaPor: DUENA };
  assert.equal(claveDeCadenaLlega({ ...base, sede: { cadena_id: 'cadena-1', owner_auth_user_id: DUENA } }), 'llega');
  // Otra cadena, ninguna, o la sede no existe.
  assert.equal(claveDeCadenaLlega({ ...base, sede: { cadena_id: 'cadena-2', owner_auth_user_id: DUENA } }), 'no_llega');
  assert.equal(claveDeCadenaLlega({ ...base, sede: { cadena_id: null, owner_auth_user_id: DUENA } }), 'no_llega');
  assert.equal(claveDeCadenaLlega({ ...base, sede: null }), 'no_llega');
  // Sede de la cadena con otra dueña: la clave es de la propietaria, no llega.
  assert.equal(claveDeCadenaLlega({ ...base, sede: { cadena_id: 'cadena-1', owner_auth_user_id: 'uid-otra' } }), 'no_llega');
});

test('si quien creó la clave deja de ser dueña de la cadena, no llega a ninguna sede', () => {
  const s = { cadena_id: 'cadena-1', owner_auth_user_id: DUENA };
  assert.equal(claveDeCadenaLlega({ sede: s, cadenaId: 'cadena-1', duenaCadena: 'uid-otra', creadaPor: DUENA }), 'ya_no_es_duena');
  assert.equal(claveDeCadenaLlega({ sede: s, cadenaId: 'cadena-1', duenaCadena: null, creadaPor: DUENA }), 'ya_no_es_duena');
});

test('GET /estudios: solo las sedes a las que la puerta dejaría pasar', () => {
  const s = (id: string, extra: Partial<SedeDeCadena> = {}): SedeDeCadena => ({
    id, nombre: id, cadena_id: 'cadena-1', owner_auth_user_id: DUENA, suspendido_en: null, subscription_status: 'active', ...extra,
  });
  const sedes = [
    s('centro'),
    s('norte'),
    s('sin-api'),
    s('suspendida', { suspendido_en: '2026-09-01T00:00:00Z' }),
    s('sin-pagar', { subscription_status: 'canceled' }),
    s('de-otra', { owner_auth_user_id: 'uid-otra' }),
  ];
  const conApiActivada = new Set(['centro', 'norte', 'suspendida', 'sin-pagar', 'de-otra']);
  const ids = sedesAlcanzables({ sedes, conApiActivada, cadenaId: 'cadena-1', duenaCadena: DUENA, creadaPor: DUENA }).map((x) => x.id);
  assert.deepEqual(ids, ['centro', 'norte']);
  assert.deepEqual(sedesAlcanzables({ sedes, conApiActivada, cadenaId: 'cadena-1', duenaCadena: 'uid-otra', creadaPor: DUENA }), []);
});
