import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planVacio, planAFormulario, formularioAPlan, motivoNoGuardable, caducaPorDias,
  type FormularioPlan,
  erroresPlan, resumenCondicionesPlan,
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
    tiposClaseIds: ['tc-1'], activo: true, ofertaHasta: null,
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

// ── Validación por campo (erroresPlan) ───────────────────────────────────────

test('erroresPlan señala el campo, no una frase suelta', () => {
  const e = erroresPlan({ ...planVacio(), tipo: 'BONO' });
  assert.equal(e.nombre, 'Ponle un nombre a la tarifa');
  assert.equal(e.precio, 'Falta el precio');
  assert.equal(e.sesiones, 'Un bono necesita cuántas sesiones incluye');
});

test('⚠️ un 0 en caducidad es un error, no «sin caducidad»', () => {
  // `enteroPositivo` convierte "0" en null, que aguas abajo significa «no
  // caduca nunca» — lo contrario de lo que acaba de escribir la propietaria.
  // Vacío sí es «sin caducidad», y eso debe seguir siendo válido.
  const base = { ...planVacio(), nombre: 'Bono', precio: '40', tipo: 'BONO' as const, sesiones: '4' };
  assert.ok(erroresPlan({ ...base, validezDias: '0' }).validezDias);
  assert.ok(erroresPlan({ ...base, validezDias: '-5' }).validezDias);
  assert.equal(erroresPlan({ ...base, validezDias: '' }).validezDias, undefined);
  assert.equal(erroresPlan({ ...base, validezDias: '60' }).validezDias, undefined);
});

test('⚠️ un 0 en límite semanal es un error, no «sin tope»', () => {
  const base = { ...planVacio(), nombre: 'Mensual', precio: '59' };
  assert.ok(erroresPlan({ ...base, limiteSemanal: '0' }).limiteSemanal);
  assert.equal(erroresPlan({ ...base, limiteSemanal: '' }).limiteSemanal, undefined);
  assert.equal(erroresPlan({ ...base, limiteSemanal: '2' }).limiteSemanal, undefined);
});

test('un precio que no es un número se explica como tal', () => {
  const e = erroresPlan({ ...planVacio(), nombre: 'X', precio: 'abc' });
  assert.match(e.precio ?? '', /números/);
});

test('motivoNoGuardable sigue diciendo lo mismo que antes, en el mismo orden', () => {
  // La otra pantalla de tarifas (configuración) la usa tal cual: afinar la
  // presentación aquí no puede cambiarle el comportamiento allí.
  assert.equal(motivoNoGuardable(planVacio()), 'Ponle un nombre a la tarifa');
  assert.equal(motivoNoGuardable({ ...planVacio(), nombre: 'X' }), 'Falta el precio');
  assert.equal(motivoNoGuardable({ ...planVacio(), nombre: 'X', precio: '-1' }), 'El precio no puede ser negativo');
  assert.equal(
    motivoNoGuardable({ ...planVacio(), nombre: 'X', precio: '10', tipo: 'BONO' }),
    'Un bono necesita cuántas sesiones incluye',
  );
  assert.equal(motivoNoGuardable({ ...planVacio(), nombre: 'X', precio: '10' }), null);
});

// ── Resumen automático ───────────────────────────────────────────────────────

test('resumenCondicionesPlan redacta el bono sin que nadie lo repita a mano', () => {
  const r = resumenCondicionesPlan({
    ...planVacio(), tipo: 'BONO', nombre: 'Bono 4', precio: '40',
    sesiones: '4', validezDias: '60',
  });
  assert.deepEqual(r, ['4 sesiones', 'Válido durante 60 días desde la compra']);
});

test('resumenCondicionesPlan dice «sin caducidad» en vez de callarse', () => {
  const r = resumenCondicionesPlan({ ...planVacio(), tipo: 'BONO', sesiones: '10' });
  assert.deepEqual(r, ['10 sesiones', 'Sin fecha de caducidad']);
});

test('resumenCondicionesPlan singulariza: 1 sesión, 1 clase', () => {
  const r = resumenCondicionesPlan({
    ...planVacio(), tipo: 'BONO', sesiones: '1', validezDias: '30', limiteSemanal: '1',
  });
  assert.deepEqual(r, ['1 sesión', 'Válido durante 30 días desde la compra', 'Máximo 1 clase por semana']);
});

test('resumenCondicionesPlan: el mensual no habla de caducidad ni de sesiones', () => {
  // Un mensual no caduca por días y no consume sesiones — mencionarlo sería
  // mentir en la tarjeta de resumen.
  const r = resumenCondicionesPlan({
    ...planVacio(), tipo: 'MENSUAL', sesiones: '99', validezDias: '99', limiteSemanal: '3',
  });
  assert.deepEqual(r, ['Se renueva y se cobra cada mes', 'Máximo 3 clases por semana']);
});

test('resumenCondicionesPlan: la clase suelta se cuenta como una, no como N sesiones', () => {
  const r = resumenCondicionesPlan({ ...planVacio(), tipo: 'PUNTUAL', sesiones: '1' });
  assert.deepEqual(r, ['Una clase, pago único', 'Sin fecha de caducidad']);
});

// ── Separador decimal ────────────────────────────────────────────────────────

test('⚠️ «59,50» son 59,50 € y no 59 €', () => {
  // `parseFloat('59,50')` se para en la coma y devuelve 59: la propietaria
  // escribe el precio como se escribe en español y el plan se guarda 50
  // céntimos más barato, sin un solo aviso.
  assert.equal(formularioAPlan(form({ nombre: 'X', precio: '59,50' })).precio, 59.5);
  assert.equal(formularioAPlan(form({ nombre: 'X', precio: '59.50' })).precio, 59.5);
  assert.equal(formularioAPlan(form({ nombre: 'X', precio: ' 59,50 € ' })).precio, 59.5);
});

test('un precio con coma no se marca como error', () => {
  assert.equal(erroresPlan(form({ nombre: 'X', precio: '59,50' })).precio, undefined);
});

test('lo que sigue sin ser un número sigue protestando', () => {
  assert.ok(erroresPlan(form({ nombre: 'X', precio: '12,3,4' })).precio);
  assert.ok(erroresPlan(form({ nombre: 'X', precio: 'gratis' })).precio);
  assert.ok(erroresPlan(form({ nombre: 'X', precio: '-1' })).precio);
});

test('un precio ilegible sigue guardándose como 0, nunca como NaN', () => {
  assert.equal(formularioAPlan(form({ nombre: 'X', precio: 'gratis' })).precio, 0);
});
