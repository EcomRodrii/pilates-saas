import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogoTienda, resumenProducto } from './tienda.ts';

const PLANES = [
  { id: 'p1', nombre: 'Mensual Ilimitado', tipo: 'MENSUAL', precio: 85, sesiones: null, activo: true },
  { id: 'p2', nombre: 'Bono 8 clases', tipo: 'BONO', precio: 64, sesiones: 8, activo: true, validezDias: 90 },
  { id: 'p3', nombre: 'Bono 4 clases', tipo: 'BONO', precio: 36, sesiones: 4, activo: true },
  { id: 'p4', nombre: 'Clase suelta', tipo: 'PUNTUAL', precio: 12, sesiones: 1, activo: true },
];

const SERVICIOS = [
  { id: 's1', nombre: 'Privada 1:1', precio: 45, duracionMin: 60, activo: true, autoReservable: true },
  { id: 's2', nombre: 'Valoración interna', precio: 0, activo: true, autoReservable: false },
];

test('Casos 1–4 · aparecen suscripciones, bonos, sueltas y privadas con su precio', () => {
  const c = catalogoTienda(PLANES, SERVICIOS);
  const porId = Object.fromEntries(c.map((p) => [p.id, p]));
  assert.equal(porId.p1.familia, 'suscripcion'); assert.equal(porId.p1.precio, 85);
  assert.equal(porId.p2.familia, 'bono');        assert.equal(porId.p2.precio, 64);
  assert.equal(porId.p4.familia, 'suelta');      assert.equal(porId.p4.precio, 12);
  assert.equal(porId.s1.familia, 'servicio');    assert.equal(porId.s1.precio, 45);
});

test('Caso 5 · un plan DESACTIVADO no aparece como comprable', () => {
  const c = catalogoTienda([{ ...PLANES[1], activo: false }], []);
  assert.equal(c.length, 0);
});

test('Caso 5 · un servicio NO auto-reservable no aparece — no es vendible online', () => {
  // Una valoración interna que el estudio nunca quiso vender.
  const c = catalogoTienda([], SERVICIOS);
  assert.deepEqual(c.map((p) => p.id), ['s1']);
});

test('un producto sin precio válido no se enseña como comprable', () => {
  assert.equal(catalogoTienda([{ id: 'x', nombre: 'Sin precio', tipo: 'BONO', precio: null, activo: true }], []).length, 0);
  assert.equal(catalogoTienda([{ id: 'x', nombre: 'Cero', tipo: 'BONO', precio: 0, activo: true }], []).length, 0);
});

test('un tipo de plan desconocido NO se inventa una familia', () => {
  // Decidir por el estudio cómo se vende algo que no entendemos es peor que
  // no enseñarlo.
  assert.equal(catalogoTienda([{ id: 'x', nombre: 'Raro', tipo: 'CUPON', precio: 10, activo: true }], []).length, 0);
});

test('orden: suscripciones, bonos, suelta, servicios — y dentro, de barato a caro', () => {
  const c = catalogoTienda(PLANES, SERVICIOS);
  assert.deepEqual(c.map((p) => p.id), ['p1', 'p3', 'p2', 'p4', 's1']);
});

test('estudio sin nada vendible devuelve lista vacía, no revienta', () => {
  assert.deepEqual(catalogoTienda([], []), []);
  assert.deepEqual(catalogoTienda(null, null), []);
  assert.deepEqual(catalogoTienda(undefined, undefined), []);
});

test('resumen: la suscripción ilimitada lo dice, no enseña «null clases»', () => {
  const c = catalogoTienda(PLANES, []);
  assert.equal(resumenProducto(c[0]), 'Clases ilimitadas');
});

test('resumen: solo menciona la caducidad si el plan la declara', () => {
  const c = catalogoTienda(PLANES, []);
  const bono8 = c.find((p) => p.id === 'p2')!;
  const bono4 = c.find((p) => p.id === 'p3')!;
  assert.match(resumenProducto(bono8), /caduca a los 90 días/);
  assert.doesNotMatch(resumenProducto(bono4), /caduca/);
});

test('resumen de una privada incluye su duración', () => {
  const c = catalogoTienda([], SERVICIOS);
  assert.match(resumenProducto(c[0]), /60 min/);
});
