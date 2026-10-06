import { test } from 'node:test';
import assert from 'node:assert/strict';
import { desdeImporte, IMPORTE_MINIMO_EUR, importeACobrar, opcionesDeClase, tienePrecioEspecial } from './opciones-de-clase.ts';
import type { PlanTarifa } from '../types.ts';

const plan = (o: Partial<PlanTarifa> & { id: string }): PlanTarifa => ({
  studioId: 'st', nombre: o.id, tipo: 'BONO', sesiones: 8, precio: 96, activo: true, ...o,
} as PlanTarifa);

const SUELTA = plan({ id: 'suelta', nombre: 'Clase suelta', tipo: 'PUNTUAL', sesiones: 1, precio: 15 });
const BONO8 = plan({ id: 'bono8', nombre: 'Bono 8', precio: 96, sesiones: 8, validezDias: 60 });
const BONO_MAT = plan({ id: 'bono-mat', nombre: 'Bono Mat', precio: 50, sesiones: 5, tiposClaseIds: ['tc-mat'] });
const MENSUAL = plan({ id: 'mes', nombre: 'Mensual', tipo: 'MENSUAL', sesiones: null, precio: 89 });
const PRUEBA = plan({ id: 'prueba', nombre: 'Prueba', tipo: 'PUNTUAL', sesiones: 1, precio: 5, esPrueba: true });

test('la suelta al precio de su tarifa y los bonos que cubren la clase; ni cuotas ni la prueba', () => {
  const r = opcionesDeClase({ planes: [MENSUAL, BONO8, SUELTA, BONO_MAT, PRUEBA], tipoClaseId: 'tc-r' });
  assert.equal(r.precioEspecial, false);
  assert.deepEqual(r.opciones.map((o) => o.planId), ['suelta', 'bono8']);
  const [s, b] = r.opciones;
  assert.deepEqual(s, { tipo: 'suelta', planId: 'suelta', nombre: 'Clase suelta', importe: 15, sesiones: 1, precioPorClase: 15, validezDias: null, quedanTrasEsta: 0 });
  // 96/8 = 12 €/clase frente a 15 €: un 20 % exacto.
  assert.equal(b.precioPorClase, 12);
  assert.equal(b.ahorroPct, 20);
  assert.equal(b.quedanTrasEsta, 7);
  assert.equal(b.validezDias, 60);
});

test('un bono acotado a otro tipo de clase no se ofrece; al suyo, sí', () => {
  assert.ok(!opcionesDeClase({ planes: [BONO_MAT], tipoClaseId: 'tc-r' }).opciones.length);
  assert.deepEqual(opcionesDeClase({ planes: [BONO_MAT], tipoClaseId: 'tc-mat' }).opciones.map((o) => o.planId), ['bono-mat']);
});

test('sin suelta no hay «ahorro» que presumir', () => {
  const [b] = opcionesDeClase({ planes: [BONO8], tipoClaseId: 'tc-r' }).opciones;
  assert.equal(b.ahorroPct, undefined);
});

test('planes apagados, a 0 € o sin sesiones no se ofrecen', () => {
  const r = opcionesDeClase({
    planes: [plan({ id: 'off', activo: false }), plan({ id: 'cero', precio: 0 }), plan({ id: 'sin', sesiones: null })],
    tipoClaseId: 'tc-r',
  });
  assert.deepEqual(r.opciones, []);
});

test('por debajo de 0,50 € se marca como no pagable (Stripe no lo cobra)', () => {
  const r = opcionesDeClase({ planes: [plan({ id: 'barata', tipo: 'PUNTUAL', sesiones: 1, precio: 0.4 }), BONO8], tipoClaseId: 'tc-r' });
  assert.equal(r.opciones[0].noPagable, true);
  assert.equal(r.opciones[1].noPagable, undefined);
  assert.equal(desdeImporte(r.opciones), 96, 'lo «desde» solo cuenta lo que se puede pagar');
  assert.equal(IMPORTE_MINIMO_EUR, 0.5);
  assert.equal(desdeImporte([]), null);
});

test('una sesión con precio propio distinto de la tarifa no se vende online (Fase A)', () => {
  const r = opcionesDeClase({ planes: [SUELTA, BONO8], tipoClaseId: 'tc-r', precioPuntualSesion: 25 });
  assert.deepEqual(r, { opciones: [], precioEspecial: true });
  // Con el MISMO precio que la tarifa no es «especial».
  assert.equal(opcionesDeClase({ planes: [SUELTA], tipoClaseId: 'tc-r', precioPuntualSesion: 15 }).precioEspecial, false);
  // Una sesión gratuita no es precio especial: no se cobra.
  assert.equal(tienePrecioEspecial(0, SUELTA), false);
  // Precio propio y ninguna suelta: tampoco se vende online.
  assert.equal(tienePrecioEspecial(20, null), true);
  assert.equal(tienePrecioEspecial(null, SUELTA), false);
});

test('importeACobrar: el mismo criterio que la pantalla, para que el cobro no haga otra cosa', () => {
  const planes = [SUELTA, BONO8, BONO_MAT];
  assert.deepEqual(importeACobrar({ plan: SUELTA, planes, tipoClaseId: 'tc-r' }), { ok: true, importe: 15 });
  assert.deepEqual(importeACobrar({ plan: BONO8, planes, tipoClaseId: 'tc-r' }), { ok: true, importe: 96 });
  assert.equal((importeACobrar({ plan: BONO_MAT, planes, tipoClaseId: 'tc-r' }) as { codigo: string }).codigo, 'no-cubre');
  assert.equal((importeACobrar({ plan: SUELTA, planes, tipoClaseId: 'tc-r', precioPuntualSesion: 30 }) as { codigo: string }).codigo, 'precio-especial');
  // Paridad: lo que se ofrece se puede cobrar, y al mismo importe.
  for (const o of opcionesDeClase({ planes, tipoClaseId: 'tc-r' }).opciones) {
    const p = planes.find((x) => x.id === o.planId)!;
    assert.deepEqual(importeACobrar({ plan: p, planes, tipoClaseId: 'tc-r' }), { ok: true, importe: o.importe });
  }
});
