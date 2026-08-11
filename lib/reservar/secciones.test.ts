import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SECCIONES_RESERVAR, ordenarSecciones, seccionVisible, esFija,
} from './secciones.ts';

const ids = (s: { id: string }[]) => s.map((x) => x.id);
const POR_DEFECTO = ids(SECCIONES_RESERVAR);

test('los ids son únicos: son la clave de orden y visibilidad', () => {
  assert.equal(new Set(POR_DEFECTO).size, POR_DEFECTO.length);
});

test('sin nada guardado, el orden es el de siempre', () => {
  // Un estudio que no toque nada no puede ver ningún cambio.
  assert.deepEqual(ids(ordenarSecciones(null)), POR_DEFECTO);
  assert.deepEqual(ids(ordenarSecciones({})), POR_DEFECTO);
  assert.deepEqual(ids(ordenarSecciones({ orden: [] })), POR_DEFECTO);
});

test('lo guardado manda para las secciones movibles', () => {
  const r = ids(ordenarSecciones({ orden: ['contacto', 'cifras', 'portada'] }));
  // El horario es fijo y se queda en SU posición del catálogo (la segunda).
  assert.equal(r[1], 'horario');
  // Las movibles salen en el orden elegido, salteando el hueco de la fija.
  assert.deepEqual(r.filter((x) => x !== 'horario'), ['contacto', 'cifras', 'portada']);
});

test('⚠️ el horario no se puede mover ni sacar del orden', () => {
  // Ni pidiéndolo explícitamente: una página de reservas sin horario está rota.
  const r = ids(ordenarSecciones({ orden: ['horario', 'portada'] }));
  assert.ok(r.includes('horario'));
  assert.equal(r[1], 'horario');
});

test('⚠️ el horario no se puede ocultar, aunque esté en `ocultos`', () => {
  // Puede haber llegado ahí a mano, o de una versión en la que sí se podía.
  assert.equal(seccionVisible('horario', { ocultos: ['horario'] }), true);
  assert.equal(esFija('horario'), true);
  // Las demás sí.
  assert.equal(seccionVisible('cifras', { ocultos: ['cifras'] }), false);
  assert.equal(seccionVisible('cifras', { ocultos: [] }), true);
  assert.equal(seccionVisible('cifras', null), true);
});

test('una sección NUEVA entra al final del orden ya guardado', () => {
  // El gotcha que ya documenta la home del panel: quien personalizó su página
  // antes de que existiera «cifras» no puede encontrársela en medio.
  const r = ids(ordenarSecciones({ orden: ['contacto', 'portada'] }));
  assert.deepEqual(r.filter((x) => x !== 'horario'), ['contacto', 'portada', 'cifras']);
});

test('una sección RETIRADA del producto no deja hueco', () => {
  const r = ids(ordenarSecciones({ orden: ['cifras', 'ya-no-existe', 'portada'] }));
  assert.ok(!r.includes('ya-no-existe'));
  // Y las que faltaban siguen entrando al final.
  assert.equal(r.length, POR_DEFECTO.length);
});

test('un orden guardado con duplicados no duplica la sección', () => {
  // Lo deja un arrastre mal guardado, y duplicar el bloque de bonos en la
  // página sería visible al instante para la clienta.
  const r = ids(ordenarSecciones({ orden: ['cifras', 'cifras', 'portada'] }));
  assert.equal(r.filter((x) => x === 'cifras').length, 1);
  assert.equal(r.length, POR_DEFECTO.length);
});

test('nunca se pierde ni se inventa una sección', () => {
  for (const guardado of [null, {}, { orden: ['contacto'] }, { orden: [...POR_DEFECTO].reverse() }]) {
    const r = ids(ordenarSecciones(guardado));
    assert.deepEqual([...r].sort(), [...POR_DEFECTO].sort());
  }
});
