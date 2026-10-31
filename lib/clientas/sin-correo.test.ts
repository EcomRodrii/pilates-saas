import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alumnas, resumenSinCorreo, tieneCorreoUtil } from './sin-correo.ts';

// Quién no puede entrar a la app por no tener correo, y cuándo se avisa.

const ficha = (id: string, email: string | null) => ({ id, email });
const ACTIVA = () => 'ACTIVA';

test('una dirección con forma de dirección cuenta; vacía, con espacios o rota, no', () => {
  assert.equal(tieneCorreoUtil('ana@example.com'), true);
  assert.equal(tieneCorreoUtil('  ana@example.com  '), true);
  for (const mal of ['', '   ', 'ana', 'ana@', '@example.com', 'ana@example', 'ana perez@example.com', null, undefined]) {
    assert.equal(tieneCorreoUtil(mal as string | null | undefined), false, String(mal));
  }
});

test('solo cuentan las que viven en el estudio: no las de baja, inactivas ni interesadas', () => {
  const fichas = [ficha('a', ''), ficha('b', ''), ficha('c', ''), ficha('d', ''), ficha('e', ''), ficha('f', 'f@example.com')];
  const estados: Record<string, string> = { a: 'ACTIVA', b: 'DE_PRUEBA', c: 'SIN_RENOVAR', d: 'DE_BAJA', e: 'INACTIVA', f: 'ACTIVA' };
  const r = resumenSinCorreo(fichas, id => estados[id]);
  assert.deepEqual([...r.ids].sort(), ['a', 'b', 'c']);
  assert.equal(r.conEstado, 4, 'el denominador son las que viven: a, b, c y f');
});

test('una ficha sin estado (datos a medias) no se cuenta: esperar es mejor que contar de más', () => {
  const r = resumenSinCorreo([ficha('a', ''), ficha('b', '')], () => undefined);
  assert.equal(r.ids.size, 0);
  assert.equal(r.conEstado, 0);
  assert.equal(r.avisar, false);
});

test('avisa con 3 o más, o con una de cada cuatro; con una de veinte, no', () => {
  const muchas = (sin: number, con: number) => [
    ...Array.from({ length: sin }, (_, i) => ficha(`s${i}`, '')),
    ...Array.from({ length: con }, (_, i) => ficha(`c${i}`, `c${i}@example.com`)),
  ];
  assert.equal(resumenSinCorreo(muchas(3, 100), ACTIVA).avisar, true, 'tres, aunque sean pocas entre cien');
  assert.equal(resumenSinCorreo(muchas(1, 3), ACTIVA).avisar, true, 'una de cuatro');
  assert.equal(resumenSinCorreo(muchas(1, 19), ACTIVA).avisar, false, 'una de veinte');
  assert.equal(resumenSinCorreo(muchas(2, 20), ACTIVA).avisar, false, 'dos de veintidós');
  assert.equal(resumenSinCorreo(muchas(0, 10), ACTIVA).avisar, false, 'ninguna');
});

test('el caso real de octubre: 24 de 25 sin correo avisa', () => {
  const fichas = [ficha('x', 'x@example.com'), ...Array.from({ length: 24 }, (_, i) => ficha(`s${i}`, ''))];
  const r = resumenSinCorreo(fichas, ACTIVA);
  assert.equal(r.ids.size, 24);
  assert.equal(r.avisar, true);
});

test('el singular y el plural', () => {
  assert.equal(alumnas(1), '1 alumna');
  assert.equal(alumnas(12), '12 alumnas');
});
