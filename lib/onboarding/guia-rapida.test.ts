import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularOnboarding, guiaRapida, PASOS_GUIA_RAPIDA, type DatosOnboarding } from '../onboarding.ts';

const vacio: DatosOnboarding = {
  nif: null, stripeAccountId: null, slug: 'estudio-de-prueba', colorPrimario: '#4F46E5', temaPortal: 'original', logoUrl: null,
  numInstructores: 0, numInstructoresConCuenta: 0, numTiposClase: 0, numSesiones: 0, numSocios: 0, numSalas: 0,
  numPlanesTarifa: 0, numSuscripcionesActivas: 0, numReservas: 0, contenidoPortalPersonalizado: false,
  automatizacionesActivas: new Set(),
};
const guia = (d: Partial<DatosOnboarding>) => guiaRapida(calcularOnboarding({ ...vacio, ...d }).categorias);

test('recién creado: 1 de 5, y solo «Crea tu estudio» está hecho', () => {
  const g = guia({});
  assert.equal(g.total, 5);
  assert.equal(g.hechos, 1);
  assert.deepEqual(g.pasos.filter((p) => p.done).map((p) => p.id), ['estudio-creado']);
  assert.equal(g.siguiente?.id, 'marca');
});

test('cada paso se marca por datos reales, nunca a mano', () => {
  assert.equal(guia({ logoUrl: 'https://example.com/logo.png' }).pasos.find((p) => p.id === 'marca')?.done, true);
  assert.equal(guia({ numTiposClase: 2 }).pasos.find((p) => p.id === 'clase')?.done, true);
  assert.equal(guia({ numSocios: 1 }).pasos.find((p) => p.id === 'clientes')?.done, true);
  assert.equal(guia({ numSesiones: 3 }).pasos.find((p) => p.id === 'horario')?.done, true);
  // Una sala o una instructora no son parte de esta guía: no la mueven.
  assert.equal(guia({ numSalas: 2, numInstructores: 1 }).hechos, 1);
});

test('es el MISMO paso que el checklist: mismo enlace, mismo dato', () => {
  const { categorias } = calcularOnboarding(vacio);
  const g = guiaRapida(categorias);
  const todos = new Map(categorias.flatMap((c) => c.pasos).map((p) => [p.id, p]));
  for (const id of PASOS_GUIA_RAPIDA) assert.equal(g.pasos.find((p) => p.id === id), todos.get(id));
});

test('todo hecho: 5 de 5, 100 % y sin siguiente', () => {
  const g = guia({ logoUrl: 'https://example.com/l.png', numTiposClase: 1, numSocios: 4, numSesiones: 9 });
  assert.equal(g.hechos, 5);
  assert.equal(g.pct, 100);
  assert.equal(g.siguiente, null);
});

test('el siguiente es el primero pendiente en orden, no el más fácil', () => {
  const g = guia({ logoUrl: 'https://example.com/l.png', numSesiones: 5 });
  assert.equal(g.siguiente?.id, 'clase');
});
