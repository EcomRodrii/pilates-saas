import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calcularPasosOnboarding, type DatosOnboarding } from './onboarding.ts';

const VACIO: DatosOnboarding = {
  nif: null, stripeAccountId: null, slug: 'mi-estudio',
  numInstructores: 0, numTiposClase: 0, numSesiones: 0, numSocios: 0,
};

test('estudio recién creado: los 7 pasos están pendientes', () => {
  const pasos = calcularPasosOnboarding(VACIO);
  assert.equal(pasos.length, 7);
  assert.ok(pasos.every(p => !p.done));
});

test('son exactamente los 7 pasos del documento de producto, en ese orden', () => {
  const labels = calcularPasosOnboarding(VACIO).map(p => p.label);
  assert.deepEqual(labels, [
    'Configura tu estudio',
    'Añade tu primer instructor',
    'Crea tu primera clase',
    'Configura tus horarios',
    'Añade tus primeros clientes',
    'Activa los métodos de pago',
    'Abre las reservas',
  ]);
});

test('cada paso se calcula a partir de un dato real, uno a uno', () => {
  assert.equal(calcularPasosOnboarding({ ...VACIO, nif: '12345678A' })[0].done, true);
  assert.equal(calcularPasosOnboarding({ ...VACIO, numInstructores: 1 })[1].done, true);
  assert.equal(calcularPasosOnboarding({ ...VACIO, numTiposClase: 1 })[2].done, true);
  assert.equal(calcularPasosOnboarding({ ...VACIO, numSesiones: 1 })[3].done, true);
  assert.equal(calcularPasosOnboarding({ ...VACIO, numSocios: 1 })[4].done, true);
  assert.equal(calcularPasosOnboarding({ ...VACIO, stripeAccountId: 'acct_123' })[5].done, true);
});

test('"Abre las reservas" no se marca solo porque uno de los otros esté hecho', () => {
  const pasos = calcularPasosOnboarding({ ...VACIO, nif: '12345678A', numInstructores: 3 });
  assert.equal(pasos[6].done, false);
});

test('"Abre las reservas" se marca hecho solo cuando TODO lo demás lo está', () => {
  const completo: DatosOnboarding = {
    nif: '12345678A', stripeAccountId: 'acct_123', slug: 'mi-estudio',
    numInstructores: 2, numTiposClase: 1, numSesiones: 5, numSocios: 10,
  };
  const pasos = calcularPasosOnboarding(completo);
  assert.equal(pasos.every(p => p.done), true);
  const ultimo = pasos[6];
  assert.equal(ultimo.done, true);
  assert.equal(ultimo.externo, true, 'al estar todo listo, el enlace se abre en pestaña nueva');
  assert.equal(ultimo.href, '/reservar/mi-estudio');
});

test('sin slug todavía, "Abre las reservas" no enlaza a una página pública rota', () => {
  const pasos = calcularPasosOnboarding({ ...VACIO, slug: null });
  assert.equal(pasos[6].href, '/configuracion?tab=estudio');
  assert.equal(pasos[6].externo, false);
});

test('los hrefs apuntan a destinos reales, no a un enlace inventado', () => {
  const hrefs = calcularPasosOnboarding(VACIO).map(p => p.href);
  assert.deepEqual(hrefs.slice(0, 6), [
    '/configuracion?tab=estudio',
    '/equipo',
    '/configuracion?tab=clases',
    '/calendario',
    '/clientas?nuevo=1',
    '/configuracion?tab=integraciones',
  ]);
});
