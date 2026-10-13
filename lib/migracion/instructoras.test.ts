import test from 'node:test';
import assert from 'node:assert/strict';
import { emparejarPorNombreDePila, esNombreDeInstructora } from './instructoras.ts';

test('nombres de persona: sí', () => {
  for (const n of ['Lucía Prueba', 'Marina Soto', 'Ana', 'María del Pilar', 'Núria Lara']) assert.equal(esNombreDeInstructora(n), true, n);
});

test('marcadores de «nadie»: no se dan de alta', () => {
  for (const n of ['', ' ', '-', '--', '—', 'N/A', 'n/a', 'NA', 'null', 'Ninguna', 'Sin asignar', 'Sin instructora', 'Por definir', 'A confirmar', 'TBD', 'Pendiente', 'Staff', '???', '123']) {
    assert.equal(esNombreDeInstructora(n), false, JSON.stringify(n));
  }
});

test('varias personas en la misma celda, nombres larguísimos y no-strings: no', () => {
  for (const n of ['Ana / Marta', 'Ana, Marta', 'Ana y Marta', 'Ana & Marta', 'Ana + Marta', 'Ana;Marta', 'Ana and Marta', 'x'.repeat(81), 'Ana\nMarta']) {
    assert.equal(esNombreDeInstructora(n), false, JSON.stringify(n));
  }
  for (const n of [null, undefined, 42, {}, ['Ana']]) assert.equal(esNombreDeInstructora(n), false, String(n));
  assert.equal(esNombreDeInstructora('x'.repeat(80).replace(/x/g, 'a')), true);
});

test('«y» dentro de un nombre no cuenta como separador', () => {
  assert.equal(esNombreDeInstructora('Yolanda Reyes'), true);
  assert.equal(esNombreDeInstructora('Aitor Ybarra'), true);
});

test('un nombre de pila se empareja con la única ficha que empieza por él', () => {
  const existentes = new Map([['ana garcia', 'i1'], ['marta lopez', 'i2'], ['maria del pilar', 'i3']]);
  assert.equal(emparejarPorNombreDePila('ana', existentes), 'i1');
  assert.equal(emparejarPorNombreDePila('maria', existentes), 'i3');
  assert.equal(emparejarPorNombreDePila('luc', existentes), null, 'no es prefijo de palabra entera');
  assert.equal(emparejarPorNombreDePila('ana garcia', existentes), null, 'con apellido ya se empareja por nombre exacto');
});

test('con dos fichas que empiezan igual no se adivina', () => {
  const existentes = new Map([['ana garcia', 'i1'], ['ana ruiz', 'i2'], ['ana ruiz lopez', 'i2']]);
  assert.equal(emparejarPorNombreDePila('ana', existentes), null);
  // La misma ficha con dos nombres normalizados cuenta una vez.
  assert.equal(emparejarPorNombreDePila('ana', new Map([['ana ruiz', 'i2'], ['ana ruiz lopez', 'i2']])), 'i2');
});
