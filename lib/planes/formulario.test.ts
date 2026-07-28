import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planVacio, planAFormulario, formularioAPlan, motivoNoGuardable, caducaPorDias,
  type FormularioPlan,
} from './formulario.ts';
import type { PlanTarifa } from '../types.ts';

const form = (parche: Partial<FormularioPlan> = {}): FormularioPlan => ({ ...planVacio(), ...parche });

// ── Lo que costó dinero ─────────────────────────────────────────────────────

test('un bono guarda su caducidad (el bug: fecha_fin NULL, bonos eternos)', () => {
  const d = formularioAPlan(form({ nombre: 'Bono 10', precio: '120', tipo: 'BONO', sesiones: '10', validezDias: '60' }));
  assert.equal(d.validezDias, 60);
  assert.equal(d.sesiones, 10);
  assert.equal(d.precio, 120);
});

test('un mensual NO caduca por días aunque el campo traiga algo', () => {
  // Se renueva, no expira. Si un formulario dejara colar validezDias en un
  // mensual, la clienta se quedaría sin plan de golpe un día cualquiera.
  const d = formularioAPlan(form({ nombre: 'Mensual', precio: '60', tipo: 'MENSUAL', validezDias: '30', sesiones: '8' }));
  assert.equal(d.validezDias, null);
  assert.equal(d.sesiones, null);
  assert.equal(caducaPorDias('MENSUAL'), false);
});

test('el límite semanal sí vale para cualquier tipo, también mensual', () => {
  const d = formularioAPlan(form({ nombre: 'Mensual', precio: '60', tipo: 'MENSUAL', limiteSemanal: '3' }));
  assert.equal(d.limiteSemanal, 3);
});

// ── Basura que no debe llegar a la base de datos ────────────────────────────

test('un precio ilegible se guarda como 0, nunca como NaN', () => {
  // NaN se propaga hasta el recibo y allí ya no se sabe de dónde salió.
  assert.equal(formularioAPlan(form({ nombre: 'X', precio: 'abc' })).precio, 0);
  assert.equal(formularioAPlan(form({ nombre: 'X', precio: '' })).precio, 0);
});

test('un precio de 0 es válido (una clase de prueba gratis)', () => {
  assert.equal(formularioAPlan(form({ nombre: 'Prueba', precio: '0' })).precio, 0);
  assert.equal(motivoNoGuardable(form({ nombre: 'Prueba', precio: '0' })), null);
});

test('sesiones o días a 0 o negativos se descartan: sería un bono nacido muerto', () => {
  const d = formularioAPlan(form({ nombre: 'B', precio: '50', tipo: 'BONO', sesiones: '0', validezDias: '-5' }));
  assert.equal(d.sesiones, null);
  assert.equal(d.validezDias, null);
});

test('los espacios se limpian y una descripción vacía es null, no ""', () => {
  const d = formularioAPlan(form({ nombre: '  Bono 10  ', precio: '50', descripcion: '   ' }));
  assert.equal(d.nombre, 'Bono 10');
  assert.equal(d.descripcion, null);
});

// ── Ida y vuelta ────────────────────────────────────────────────────────────

test('editar y volver a guardar sin tocar nada no cambia el plan', () => {
  const guardado = {
    id: 'plan-1', studioId: 's-1', nombre: 'Bono 10 clases', descripcion: 'Diez sesiones',
    precio: 120, tipo: 'BONO', sesiones: 10, validezDias: 60, limiteSemanal: null,
    tiposClaseIds: ['tc-1'], activo: true,
  } as PlanTarifa;

  const vuelta = formularioAPlan(planAFormulario(guardado));
  const { id: _i, studioId: _s, ...esperado } = guardado;
  assert.deepEqual(vuelta, esperado);
});

test('un campo opcional que llega undefined no pinta "undefined" en el input', () => {
  // `validezDias`/`limiteSemanal` son opcionales en el tipo: pueden llegar
  // undefined además de null. Con una comparación estricta a null, el input
  // mostraba el literal "undefined".
  const p = { id: 'p', studioId: 's', nombre: 'X', descripcion: null, precio: 10,
    tipo: 'MENSUAL', sesiones: null, activo: true } as unknown as PlanTarifa;
  const f = planAFormulario(p);
  assert.equal(f.validezDias, '');
  assert.equal(f.limiteSemanal, '');
  assert.equal(f.descripcion, '');
});

test('sin restricción de clases, el plan vale para todas (lista vacía)', () => {
  assert.deepEqual(formularioAPlan(form({ nombre: 'X', precio: '1' })).tiposClaseIds, []);
});

// ── Por qué no deja guardar ─────────────────────────────────────────────────

test('dice QUÉ falta, no solo que no se puede', () => {
  assert.match(motivoNoGuardable(form()) ?? '', /nombre/i);
  assert.match(motivoNoGuardable(form({ nombre: 'X' })) ?? '', /precio/i);
  assert.match(motivoNoGuardable(form({ nombre: 'X', precio: '-1' })) ?? '', /negativo/i);
});

test('un bono sin sesiones no se puede guardar: no daría derecho a nada', () => {
  const f = form({ nombre: 'Bono', precio: '90', tipo: 'BONO' });
  assert.match(motivoNoGuardable(f) ?? '', /sesiones/i);
  assert.equal(motivoNoGuardable({ ...f, sesiones: '10' }), null);
});

test('un mensual no necesita sesiones', () => {
  assert.equal(motivoNoGuardable(form({ nombre: 'Mensual', precio: '60' })), null);
});

test('dos formularios vacíos no comparten la lista de clases', () => {
  // Si `planVacio` devolviera una constante compartida, marcar una clase en un
  // formulario la marcaría en el siguiente. Silencioso y muy difícil de atribuir.
  const a = planVacio();
  const b = planVacio();
  a.tiposClaseIds.push('tc-1');
  assert.deepEqual(b.tiposClaseIds, []);
  assert.notEqual(a.tiposClaseIds, b.tiposClaseIds);
});
