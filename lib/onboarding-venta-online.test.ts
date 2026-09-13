import { test } from 'node:test';
import assert from 'node:assert/strict';

import { avisoVentaOnline, calcularOnboarding, type DatosOnboarding } from './onboarding.ts';

// Evaluación del 13-sep: el panel decía «Tu estudio ya puede recibir reservas»
// a un estudio que exigía bono para reservar, tenía el bono activo y no tenía
// Stripe. Una alumna nueva llegaba a la página, leía «para reservar necesitas un
// bono» y no podía comprarlo online.

const BASE: DatosOnboarding = {
  nif: '1', stripeAccountId: null, slug: 'salma', colorPrimario: null, temaPortal: null, logoUrl: 'x',
  numInstructores: 1, numInstructoresConCuenta: 1, numTiposClase: 3, numSesiones: 40, numSocios: 5,
  numSalas: 2, numPlanesTarifa: 1, numSuscripcionesActivas: 1, numReservas: 0,
  contenidoPortalPersonalizado: false, automatizacionesActivas: new Set(),
  reservaExigirPlan: true, numPlanesActivos: 1, numPlanesBorrador: 1,
};

test('avisa justo en el caso que bloquea: exige bono + tarifa activa + sin Stripe', () => {
  assert.match(avisoVentaOnline(BASE) ?? '', /no puede comprarlo online/);
});

test('no avisa cuando la alumna SÍ puede reservar', () => {
  // Con Stripe puede comprar el bono online.
  assert.equal(avisoVentaOnline({ ...BASE, stripeAccountId: 'acct_1' }), null);
  // Sin exigir bono, reserva sin comprar nada.
  assert.equal(avisoVentaOnline({ ...BASE, reservaExigirPlan: false }), null);
  // Sin tarifas activas el gate ni se aplica (`hayAlgoQueContratar`).
  assert.equal(avisoVentaOnline({ ...BASE, numPlanesActivos: 0 }), null);
});

test('sin datos del ajuste no se inventa el aviso', () => {
  assert.equal(avisoVentaOnline({ stripeAccountId: null, numPlanesActivos: 3 }), null);
});

test('la recomendación concreta sustituye a la genérica de Stripe, no se suman', () => {
  const ids = calcularOnboarding(BASE).recomendaciones.map(r => r.id);
  assert.equal(ids[0], 'venta-online');
  assert.ok(!ids.includes('stripe'), `dice lo mismo dos veces: ${ids.join(', ')}`);
  // Y cuando no aplica, vuelve la genérica.
  const sinGate = calcularOnboarding({ ...BASE, reservaExigirPlan: false }).recomendaciones.map(r => r.id);
  assert.ok(sinGate.includes('stripe'));
  assert.ok(!sinGate.includes('venta-online'));
});

// Mismo día: el asistente deja «Bono 10 sesiones» y «Cuota mensual» en borrador
// (sin precio, inactivos) y el aviso decía «Todavía no has creado ningún bono».
test('con tarifas en borrador no dice que no existen: dice qué falta para venderlas', () => {
  const r = calcularOnboarding({ ...BASE, numPlanesTarifa: 0, numPlanesActivos: 0, numPlanesBorrador: 2 });
  const bonos = r.recomendaciones.find(x => x.id === 'bonos');
  assert.ok(bonos, 'tiene que seguir avisando');
  assert.equal(bonos.texto, 'Tienes 2 tarifas en borrador: ponles precio y actívalas para poder vender.');
  assert.equal(bonos.href, '/productos');
});

test('sin ninguna tarifa, el aviso de siempre', () => {
  const r = calcularOnboarding({ ...BASE, numPlanesTarifa: 0, numPlanesActivos: 0, numPlanesBorrador: 0 });
  assert.equal(r.recomendaciones.find(x => x.id === 'bonos')?.texto, 'Todavía no has creado ningún bono ni membresía.');
});
