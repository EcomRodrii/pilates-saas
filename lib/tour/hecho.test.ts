import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datosHecho, type FuenteHecho } from './hecho.ts';

const vacio: FuenteHecho = {
  studio: { nif: null, razonSocial: null, logoUrl: null },
  salas: [], tiposClase: [], sesiones: [], socios: [], instructores: [], planesTarifa: [], suscripciones: [],
};

test('un estudio recién creado no tiene nada hecho', () => {
  assert.deepEqual(Object.values(datosHecho(vacio)).filter(Boolean), []);
});

test('una tarifa en borrador (el asistente de alta las deja inactivas y a 0 €) NO cuenta', () => {
  const d = datosHecho({ ...vacio, planesTarifa: [{ activo: false, precio: 0 }, { activo: true, precio: 0 }, { activo: false, precio: 40 }] });
  assert.equal(d.tarifaActiva, false);
});

test('el caso de Alya: cuatro tarifas activas con precio y una clienta sin plan', () => {
  const d = datosHecho({
    ...vacio,
    planesTarifa: [20, 35, 60, 90].map(precio => ({ activo: true, precio })),
    socios: [{}], tiposClase: [{}], sesiones: [{}, {}], salas: [{}], instructores: [{}],
  });
  assert.equal(d.tarifaActiva, true);
  assert.equal(d.socios, true);
  assert.equal(d.planAsignado, false, 'tiene tarifas pero ninguna asignada: ahí se atascó');
});

test('asignar un plan (cuota o bono) lo da por hecho', () => {
  assert.equal(datosHecho({ ...vacio, suscripciones: [{}] }).planAsignado, true);
});

test('los datos fiscales piden razón social Y NIF', () => {
  assert.equal(datosHecho({ ...vacio, studio: { nif: 'B12345678', razonSocial: '', logoUrl: null } }).datosFiscales, false);
  assert.equal(datosHecho({ ...vacio, studio: { nif: '  ', razonSocial: 'Alya SL', logoUrl: null } }).datosFiscales, false);
  assert.equal(datosHecho({ ...vacio, studio: { nif: 'B12345678', razonSocial: 'Alya SL', logoUrl: null } }).datosFiscales, true);
});
