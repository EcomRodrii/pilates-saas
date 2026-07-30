import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bonoActivo, plazaFijaTexto, fechaLarga } from './bonos-portal.ts';
import type { PlanTarifa, PlazaFija, Sala, Suscripcion, TipoClase } from './types.ts';

const plan = (o: Partial<PlanTarifa> & { id: string }): PlanTarifa => ({
  studioId: 's', nombre: 'Bono 10', descripcion: null, precio: 175, tipo: 'BONO', sesiones: 10, ...o,
} as PlanTarifa);

const sus = (o: Partial<Suscripcion> & { id: string; planId: string }): Suscripcion => ({
  studioId: 's', socioId: 'soc-1', estado: 'ACTIVA', fechaInicio: '2026-07-01',
  fechaFin: null, sesionesRestantes: null, stripeSubscriptionId: null, ...o,
} as Suscripcion);

const TIPOS: TipoClase[] = [
  { id: 'tc-1', studioId: 's', nombre: 'Reformer' } as TipoClase,
  { id: 'tc-2', studioId: 's', nombre: 'Mat' } as TipoClase,
];
const SALAS: Sala[] = [{ id: 'sala-1', studioId: 's', nombre: 'Sala Norte', capacidad: 8 } as Sala];

test('sin socia identificada no hay bono', () => {
  assert.equal(bonoActivo([sus({ id: 'a', planId: 'p1' })], [plan({ id: 'p1' })], TIPOS, null), null);
});

test('el saldo y la barra salen de sesionesRestantes y del plan', () => {
  const b = bonoActivo(
    [sus({ id: 'a', planId: 'p1', sesionesRestantes: 8, fechaFin: '2026-09-30' })],
    [plan({ id: 'p1' })], TIPOS, 'soc-1',
  );
  assert.equal(b?.restantes, 8);
  assert.equal(b?.total, 10);
  assert.equal(b?.progreso, 0.8);
  assert.equal(b?.caducaEn, '2026-09-30');
  assert.equal(b?.precio, 175);
});

test('un bono acotado a UN tipo lo dice en el nombre; con varios, no', () => {
  const uno = bonoActivo(
    [sus({ id: 'a', planId: 'p1' })],
    [plan({ id: 'p1', tiposClaseIds: ['tc-1'] })], TIPOS, 'soc-1',
  );
  assert.equal(uno?.nombre, 'Bono 10 · Reformer');

  const varios = bonoActivo(
    [sus({ id: 'a', planId: 'p1' })],
    [plan({ id: 'p1', tiposClaseIds: ['tc-1', 'tc-2'] })], TIPOS, 'soc-1',
  );
  assert.equal(varios?.nombre, 'Bono 10');
});

test('un mensual ilimitado NO pinta barra de progreso', () => {
  const b = bonoActivo(
    [sus({ id: 'a', planId: 'p1', sesionesRestantes: null })],
    [plan({ id: 'p1', nombre: 'Ilimitado', tipo: 'MENSUAL', sesiones: null, precio: 129 })], TIPOS, 'soc-1',
  );
  assert.equal(b?.progreso, null);
  assert.equal(b?.esMensual, true);
});

test('con varios activos gana el que caduca antes, no el primero de la lista', () => {
  const b = bonoActivo(
    [
      sus({ id: 'tarde', planId: 'p-mes', fechaFin: '2026-12-31' }),
      sus({ id: 'pronto', planId: 'p1', sesionesRestantes: 2, fechaFin: '2026-08-05' }),
    ],
    [plan({ id: 'p1' }), plan({ id: 'p-mes', nombre: 'Ilimitado', tipo: 'MENSUAL', sesiones: null })],
    TIPOS, 'soc-1',
  );
  assert.equal(b?.suscripcionId, 'pronto');
});

test('una suscripción sin caducidad no le gana a una que sí caduca', () => {
  const b = bonoActivo(
    [
      sus({ id: 'sin-fin', planId: 'p1', sesionesRestantes: 9 }),
      sus({ id: 'con-fin', planId: 'p1', sesionesRestantes: 1, fechaFin: '2026-09-01' }),
    ],
    [plan({ id: 'p1' })], TIPOS, 'soc-1',
  );
  assert.equal(b?.suscripcionId, 'con-fin');
});

test('las canceladas y las de otra socia no cuentan', () => {
  assert.equal(bonoActivo([sus({ id: 'a', planId: 'p1', estado: 'CANCELADA' })], [plan({ id: 'p1' })], TIPOS, 'soc-1'), null);
  assert.equal(bonoActivo([sus({ id: 'a', planId: 'p1', socioId: 'otra' })], [plan({ id: 'p1' })], TIPOS, 'soc-1'), null);
});

test('una suscripción a un plan que ya no existe no rompe la pantalla', () => {
  assert.equal(bonoActivo([sus({ id: 'a', planId: 'borrado' })], [plan({ id: 'p1' })], TIPOS, 'soc-1'), null);
});

test('el saldo no se sale de la barra aunque los datos vengan raros', () => {
  const b = bonoActivo(
    [sus({ id: 'a', planId: 'p1', sesionesRestantes: 14 })],
    [plan({ id: 'p1', sesiones: 10 })], TIPOS, 'soc-1',
  );
  assert.equal(b?.progreso, 1);
});

// ── Plaza fija ───────────────────────────────────────────────────────────────

const pf = (o: Partial<PlazaFija> = {}): PlazaFija => ({
  id: 'pf', studioId: 's', socioId: 'soc-1', diaSemana: 3, horaInicio: '18:30:00',
  salaId: 'sala-1', tipoClaseId: 'tc-1', spotId: 'sp-7', vigenciaDesde: '2026-01-01',
  vigenciaHasta: null, estado: 'ACTIVA', creadaEn: '', ...o,
} as PlazaFija);

test('la plaza fija se lee en día y hora, no en números', () => {
  const r = plazaFijaTexto([pf()], 'soc-1', SALAS, TIPOS);
  assert.equal(r?.cuando, 'Miércoles · 18:30');
  assert.equal(r?.donde, 'Reformer · Sala Norte');
});

test('una plaza pausada o de baja no se enseña como si la tuviera', () => {
  assert.equal(plazaFijaTexto([pf({ estado: 'PAUSADA' })], 'soc-1', SALAS, TIPOS), null);
  assert.equal(plazaFijaTexto([pf({ estado: 'BAJA' })], 'soc-1', SALAS, TIPOS), null);
});

test('sin tipo de clase la línea no deja un separador huérfano', () => {
  const r = plazaFijaTexto([pf({ tipoClaseId: null })], 'soc-1', SALAS, TIPOS);
  assert.equal(r?.donde, 'Sala Norte');
});

// ── Fecha ────────────────────────────────────────────────────────────────────

test('la caducidad se escribe en palabras, y el año solo si no es este', () => {
  const hoy = new Date(2026, 6, 30);
  assert.equal(fechaLarga('2026-09-30', hoy), '30 de septiembre');
  assert.equal(fechaLarga('2027-01-08', hoy), '8 de enero de 2027');
  assert.equal(fechaLarga('', hoy), '');
});
