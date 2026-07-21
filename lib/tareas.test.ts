import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TAREAS, buscarTareas, normalizar, rutaBase } from './tareas.ts';

const ids = (q: string) => buscarTareas(q).map((t) => t.id);

test('sin escribir nada propone tareas: al abrir ⌘K ya se ve qué se puede hacer', () => {
  const r = buscarTareas('');
  assert.ok(r.length > 0);
  assert.equal(r[0].id, TAREAS[0].id);
});

test('encuentra por el verbo con el que lo diría una persona', () => {
  assert.ok(ids('crear una clase').includes('nueva-clase'));
  assert.ok(ids('dar de alta').includes('nueva-clienta'));
  assert.ok(ids('reservar').includes('nueva-cita'));
});

test('encuentra por el término de la competencia, no solo por el nuestro', () => {
  // Quien viene de otra plataforma busca "bono" o "membresía", no "plan".
  assert.ok(ids('bono').includes('nuevo-plan'));
  assert.ok(ids('membresia').includes('nuevo-plan'));
  // "TPV" es como se llama la caja en el sector; el menú dice "POS".
  assert.ok(ids('tpv').includes('cobrar-caja'));
  assert.ok(ids('mindbody').includes('importar-clientas'));
});

test('los acentos no importan en ningún sentido', () => {
  assert.ok(ids('anadir').includes('nuevo-instructor'));
  assert.ok(ids('añadir').includes('nuevo-instructor'));
  assert.equal(normalizar('Añadir Instructora'), 'anadir instructora');
});

test('encuentra aunque las palabras vayan en otro orden', () => {
  assert.ok(ids('alta clienta').includes('nueva-clienta'));
});

test('"cobrar" ofrece las dos formas de cobrar, no una sola', () => {
  const r = ids('cobrar');
  assert.ok(r.includes('cobrar-caja'), 'falta la caja');
  assert.ok(r.includes('nuevo-cobro'), 'falta la mensualidad');
});

test('lo que no existe no devuelve nada, en vez de inventar', () => {
  assert.deepEqual(buscarTareas('zzzzqqq'), []);
});

test('respeta el límite pedido', () => {
  assert.ok(buscarTareas('', 3).length === 3);
  assert.ok(buscarTareas('a', 2).length <= 2);
});

test('rutaBase quita los parámetros, para poder comprobar permisos', () => {
  assert.equal(rutaBase('/socios?nuevo=1'), '/socios');
  assert.equal(rutaBase('/configuracion?tab=planes'), '/configuracion');
  assert.equal(rutaBase('/informes'), '/informes');
});

test('el catálogo está bien formado', () => {
  const vistos = new Set<string>();
  for (const t of TAREAS) {
    assert.ok(!vistos.has(t.id), `id repetido: ${t.id}`);
    vistos.add(t.id);
    assert.ok(t.href.startsWith('/'), `href debe ser absoluto: ${t.id}`);
    assert.ok(t.claves.length > 0, `sin sinónimos: ${t.id}`);
    // Las claves se comparan ya normalizadas: si una lleva acento o mayúscula,
    // nunca llegaría a coincidir.
    for (const c of t.claves) {
      assert.equal(c, normalizar(c), `clave sin normalizar en ${t.id}: "${c}"`);
    }
  }
});
