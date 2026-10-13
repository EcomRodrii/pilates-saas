import { test } from 'node:test';
import assert from 'node:assert/strict';
import { herramientasDelRol, NOMBRES_DEFINIDOS } from './herramientas/definiciones.ts';
import { NOMBRES_HERRAMIENTAS } from './tipos.ts';
import { puedeUsarAsistente, ROLES_ASISTENTE } from './roles.ts';

test('la propietaria tiene las 19; la gerente 17, sin dinero; recepción e instructoras, ninguna', () => {
  assert.equal(herramientasDelRol('PROPIETARIO').length, 19);
  const gerente = herramientasDelRol('MANAGER').map(h => h.nombre);
  assert.equal(gerente.length, 17);
  assert.ok(!gerente.includes('facturacion_del_periodo'));
  assert.ok(!gerente.includes('pagos_pendientes'));
  assert.deepEqual(herramientasDelRol('RECEPCION'), []);
  assert.deepEqual(herramientasDelRol('INSTRUCTOR'), []);
});

test('quién puede usarlo: propietaria y gerencia, una sola lista', () => {
  assert.deepEqual([...ROLES_ASISTENTE], ['PROPIETARIO', 'MANAGER']);
  assert.equal(puedeUsarAsistente('RECEPCION'), false);
  assert.equal(puedeUsarAsistente('INSTRUCTOR'), false);
  assert.equal(puedeUsarAsistente('MANAGER'), true);
});

test('el registro tiene las 19 del catálogo, en su orden fijo', () => {
  assert.deepEqual([...NOMBRES_DEFINIDOS], [...NOMBRES_HERRAMIENTAS]);
});
