import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planesComprablesParaReservar, planCubreTipo } from './reserva-planes-comprables.ts';
import type { PlanTarifa } from './types.ts';

const plan = (o: Partial<PlanTarifa> & Pick<PlanTarifa, 'id' | 'nombre' | 'tipo' | 'precio'>): PlanTarifa => ({
  studioId: 'st', activo: true, sesiones: null, validezDias: null, descripcion: null,
  limiteSemanal: null, tiposClaseIds: null, ofertaHasta: null,
  ...o,
} as PlanTarifa);

// El caso que motivó todo esto: un estudio de Pilates que vende bonos de 10 y
// una cuota mensual, sin clases sueltas. Antes no se le podía vender NADA por
// el enlace público: la visitante daba nombre, teléfono y firmaba el contrato
// para toparse con «necesitas un plan o bono activo» y ninguna forma de
// comprarlo.
test('un estudio que solo vende bonos ya puede vender por el enlace público', () => {
  const planes = [
    plan({ id: 'b', nombre: 'Bono 10 sesiones', tipo: 'BONO', precio: 120, sesiones: 10 }),
    plan({ id: 'm', nombre: 'Cuota mensual', tipo: 'MENSUAL', precio: 75 }),
  ];
  const r = planesComprablesParaReservar('tc-1', planes);
  assert.deepEqual(r.map(p => p.id), ['b']);
});

test('la clase suelta va siempre delante del bono, aunque sea más cara de listar', () => {
  const planes = [
    plan({ id: 'b', nombre: 'Bono 10', tipo: 'BONO', precio: 120, sesiones: 10 }),
    plan({ id: 's', nombre: 'Clase suelta', tipo: 'PUNTUAL', precio: 18 }),
  ];
  assert.deepEqual(planesComprablesParaReservar(null, planes).map(p => p.id), ['s', 'b']);
});

test('dentro de un tipo, de más barato a más caro', () => {
  const planes = [
    plan({ id: 'b20', nombre: 'Bono 20', tipo: 'BONO', precio: 220, sesiones: 20 }),
    plan({ id: 'b10', nombre: 'Bono 10', tipo: 'BONO', precio: 120, sesiones: 10 }),
  ];
  assert.deepEqual(planesComprablesParaReservar(null, planes).map(p => p.id), ['b10', 'b20']);
});

test('una MENSUAL nunca se ofrece en el pago sin cuenta', () => {
  const planes = [plan({ id: 'm', nombre: 'Ilimitado', tipo: 'MENSUAL', precio: 90 })];
  assert.deepEqual(planesComprablesParaReservar(null, planes), []);
});

test('no se ofrece un bono que no cubre el tipo de esta clase', () => {
  const planes = [plan({ id: 'b', nombre: 'Bono Reformer', tipo: 'BONO', precio: 120, sesiones: 10, tiposClaseIds: ['tc-reformer'] })];
  assert.deepEqual(planesComprablesParaReservar('tc-yoga', planes), []);
  assert.deepEqual(planesComprablesParaReservar('tc-reformer', planes).map(p => p.id), ['b']);
});

test('sin tipos marcados, el plan cubre todas las clases', () => {
  assert.equal(planCubreTipo(plan({ id: 'x', nombre: 'x', tipo: 'BONO', precio: 10 }), 'lo-que-sea'), true);
});

test('ni planes inactivos ni de 0 € (serían clases gratis por el enlace público)', () => {
  const planes = [
    plan({ id: 'off', nombre: 'Antiguo', tipo: 'BONO', precio: 100, activo: false }),
    plan({ id: 'free', nombre: 'Regalo', tipo: 'PUNTUAL', precio: 0 }),
  ];
  assert.deepEqual(planesComprablesParaReservar(null, planes), []);
});
