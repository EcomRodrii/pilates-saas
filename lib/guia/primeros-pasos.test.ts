import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OPCIONAL, TAREAS, primerosPasos } from './primeros-pasos.ts';
import { calcularOnboarding, type DatosOnboarding } from '../onboarding.ts';

const vacio: DatosOnboarding = {
  nif: null, stripeAccountId: null, slug: 'estudio', colorPrimario: null, temaPortal: null, logoUrl: null,
  numInstructores: 0, numInstructoresConCuenta: 0, numTiposClase: 0, numSesiones: 0, numSocios: 0, numSalas: 1,
  numPlanesTarifa: 0, numSuscripcionesActivas: 0, numReservas: 0, contenidoPortalPersonalizado: false,
  automatizacionesActivas: new Set(),
};

test('cada tarea es un paso que calcularOnboarding conoce (si no, nunca se marcaría)', () => {
  const ids = new Set(calcularOnboarding(vacio).categorias.flatMap(c => c.pasos.map(p => p.id)));
  for (const t of [...TAREAS, OPCIONAL]) assert.ok(ids.has(t.id), `«${t.titulo}» apunta a un paso que no existe: ${t.id}`);
});

test('un estudio recién creado tiene las seis por hacer y la primera es la siguiente', () => {
  const p = primerosPasos(calcularOnboarding(vacio).categorias);
  assert.equal(p.total, 6);
  assert.equal(p.hechas, 0);
  assert.equal(p.siguiente?.id, 'instructor');
  assert.equal(p.opcional.hecha, false);
});

test('se marcan solas con datos reales, y Stripe no cuenta para terminar', () => {
  const datos: DatosOnboarding = {
    ...vacio, numInstructores: 1, numTiposClase: 2, numSesiones: 10, numPlanesTarifa: 1, numPlanesActivos: 1,
    numSocios: 5, numReservas: 1,
  };
  const p = primerosPasos(calcularOnboarding(datos).categorias);
  assert.equal(p.hechas, 6);
  assert.equal(p.siguiente, null);
  assert.equal(p.opcional.hecha, false); // sin Stripe, y aun así terminada
});

test('a medias: la siguiente es la primera que falta, no la última', () => {
  const datos: DatosOnboarding = { ...vacio, numInstructores: 1, numTiposClase: 1, numSocios: 3 };
  const p = primerosPasos(calcularOnboarding(datos).categorias);
  assert.equal(p.hechas, 3);
  assert.equal(p.siguiente?.id, 'horario');
});

test('un paso desconocido cuenta como no hecho', () => {
  const p = primerosPasos([{ pasos: [{ id: 'otra-cosa', done: true }] }]);
  assert.equal(p.hechas, 0);
});

test('los textos caben: título corto con verbo y una sola línea de para qué', () => {
  for (const t of [...TAREAS, OPCIONAL]) {
    assert.ok(t.titulo.length <= 40, `título largo: ${t.titulo}`);
    assert.ok(t.para.length <= 80, `«para» largo: ${t.para}`);
    assert.ok(t.href.startsWith('/'), t.href);
  }
});
