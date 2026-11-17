import test from 'node:test';
import assert from 'node:assert/strict';
import { alternativasDireccion, baseDeDireccion, candidatasDireccion, CANDIDATAS_MAX, direccionElegidaVale, resolverDireccion } from './direccion.ts';

test('la base sale del mismo slugify que el alta', () => {
  assert.equal(baseDeDireccion('Pilates Málaga'), 'pilates-malaga');
  assert.equal(baseDeDireccion('!!!'), 'estudio');
});

test('candidatas: la base y «-2»…«-5», en ese orden', () => {
  const c = candidatasDireccion('alba');
  assert.deepEqual(c, ['alba', 'alba-2', 'alba-3', 'alba-4', 'alba-5']);
  assert.equal(c.length, CANDIDATAS_MAX);
});

test('libre: la dirección es la base', () => {
  const r = resolverDireccion('alba', new Set());
  assert.deepEqual([r.estado, r.asignada], ['libre', 'alba']);
});

test('ocupada: toca la primera con número que esté libre, como generateUniqueSlug', () => {
  const r = resolverDireccion('alba', new Set(['alba', 'alba-2']));
  assert.deepEqual([r.estado, r.asignada], ['con_numero', 'alba-3']);
});

test('una palabra de la aplicación se salta aunque nadie la tenga', () => {
  const r = resolverDireccion('login', new Set());
  assert.equal(r.reservada, true);
  assert.deepEqual([r.estado, r.asignada], ['con_numero', 'login-2']);
});

test('si no se pudo leer, no se promete nada (y no es «libre»)', () => {
  const r = resolverDireccion('alba', null);
  assert.deepEqual([r.estado, r.asignada], ['desconocido', null]);
});

test('si están todas las miradas, agotada y sin promesa', () => {
  const r = resolverDireccion('alba', new Set(candidatasDireccion('alba')));
  assert.deepEqual([r.estado, r.asignada], ['agotada', null]);
});

test('libres: todas las candidatas que se pueden coger, en orden, y de ahí salen las alternativas', () => {
  const r = resolverDireccion('alba', new Set(['alba', 'alba-3']));
  assert.deepEqual(r.libres, ['alba-2', 'alba-4', 'alba-5']);
  assert.equal(r.asignada, 'alba-2');
  assert.deepEqual(alternativasDireccion(r), ['alba-4', 'alba-5']);
});

test('sin respuesta o agotada no hay libres ni alternativas', () => {
  assert.deepEqual(resolverDireccion('alba', null).libres, []);
  assert.deepEqual(resolverDireccion('alba', new Set(candidatasDireccion('alba'))).libres, []);
  assert.deepEqual(alternativasDireccion(null), []);
});

test('una dirección elegida solo vale si sigue entre las libres de ESA respuesta', () => {
  const r = resolverDireccion('alba', new Set(['alba']));
  assert.equal(direccionElegidaVale('alba-3', r), true);
  assert.equal(direccionElegidaVale('alba-9', r), false);
  assert.equal(direccionElegidaVale(null, r), false);
  assert.equal(direccionElegidaVale('alba-3', null), false);
  // Una respuesta sin `libres` (un servidor viejo) nunca deja elegir.
  assert.equal(direccionElegidaVale('alba-3', {} as never), false);
});
