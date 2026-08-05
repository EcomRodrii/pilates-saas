import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calcularPasosOnboarding, calcularOnboarding, type DatosOnboardingLegacy, type DatosOnboarding } from './onboarding.ts';

// ─── Legacy (embudo interno, app/api/interno/kpis/route.ts) ────────────────

const VACIO: DatosOnboardingLegacy = {
  nif: null, stripeAccountId: null, slug: 'mi-estudio',
  numInstructores: 0, numTiposClase: 0, numSesiones: 0, numSocios: 0,
};

test('legacy: estudio recién creado: los 7 pasos están pendientes', () => {
  const pasos = calcularPasosOnboarding(VACIO);
  assert.equal(pasos.length, 7);
  assert.ok(pasos.every(p => !p.done));
});

test('legacy: son exactamente los 7 pasos, en ese orden', () => {
  const labels = calcularPasosOnboarding(VACIO).map(p => p.label);
  assert.deepEqual(labels, [
    'Configura tu estudio',
    'Añade tu primera instructora',
    'Crea tu primera clase',
    'Configura tus horarios',
    'Añade tus primeras clientas',
    'Activa los métodos de pago',
    'Abre las reservas',
  ]);
});

test('legacy: cada paso se calcula a partir de un dato real, uno a uno', () => {
  assert.equal(calcularPasosOnboarding({ ...VACIO, nif: '12345678A' })[0].done, true);
  assert.equal(calcularPasosOnboarding({ ...VACIO, numInstructores: 1 })[1].done, true);
  assert.equal(calcularPasosOnboarding({ ...VACIO, numTiposClase: 1 })[2].done, true);
  assert.equal(calcularPasosOnboarding({ ...VACIO, numSesiones: 1 })[3].done, true);
  assert.equal(calcularPasosOnboarding({ ...VACIO, numSocios: 1 })[4].done, true);
  assert.equal(calcularPasosOnboarding({ ...VACIO, stripeAccountId: 'acct_123' })[5].done, true);
});

test('legacy: "Abre las reservas" no se marca solo porque uno de los otros esté hecho', () => {
  const pasos = calcularPasosOnboarding({ ...VACIO, nif: '12345678A', numInstructores: 3 });
  assert.equal(pasos[6].done, false);
});

test('legacy: "Abre las reservas" se marca hecho solo cuando TODO lo demás lo está', () => {
  const completo: DatosOnboardingLegacy = {
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

test('legacy: sin slug todavía, "Abre las reservas" no enlaza a una página pública rota', () => {
  const pasos = calcularPasosOnboarding({ ...VACIO, slug: null });
  assert.equal(pasos[6].href, '/configuracion?tab=estudio');
  assert.equal(pasos[6].externo, false);
});

// ─── Nuevo: checklist por categorías (dashboard) ───────────────────────────

const VACIO_V2: DatosOnboarding = {
  nif: null, stripeAccountId: null, slug: 'mi-estudio',
  colorPrimario: '#4F46E5', temaPortal: 'original', logoUrl: null,
  numInstructores: 0, numInstructoresConCuenta: 0, numTiposClase: 0, numSesiones: 0, numSocios: 0,
  numSalas: 0, numPlanesTarifa: 0, numSuscripcionesActivas: 0,
  contenidoPortalPersonalizado: false, automatizacionesActivas: new Set(),
};

test('v2: estudio recién creado, todos los pasos de todas las categorías pendientes', () => {
  const r = calcularOnboarding(VACIO_V2);
  assert.equal(r.totalCompletados, 0);
  assert.ok(r.totalPasos > 7, 'tiene más pasos que la versión original, no menos');
  assert.equal(r.categorias.length, 5);
  assert.deepEqual(r.categorias.map(c => c.id), ['configuracion-inicial', 'pagos', 'automatizaciones', 'equipo', 'portal']);
});

test('v2: "Personaliza tu marca" no se marca hecho con los valores por defecto', () => {
  const r = calcularOnboarding(VACIO_V2);
  const marca = r.categorias[0].pasos.find(p => p.id === 'marca')!;
  assert.equal(marca.done, false);
});

test('v2: "Personaliza tu marca" se marca hecho con logo, color o tema distintos del default', () => {
  assert.equal(calcularOnboarding({ ...VACIO_V2, logoUrl: 'https://x/logo.png' }).categorias[0].pasos.find(p => p.id === 'marca')!.done, true);
  assert.equal(calcularOnboarding({ ...VACIO_V2, colorPrimario: '#000000' }).categorias[0].pasos.find(p => p.id === 'marca')!.done, true);
  assert.equal(calcularOnboarding({ ...VACIO_V2, temaPortal: 'oliva' }).categorias[0].pasos.find(p => p.id === 'marca')!.done, true);
});

test('v2: "Abre las reservas" exige también Stripe, no solo el resto de configuración inicial', () => {
  const casiTodo: DatosOnboarding = {
    ...VACIO_V2, nif: '12345678A', logoUrl: 'x', numSalas: 1, numInstructores: 1,
    numTiposClase: 1, numSesiones: 1, numSocios: 1, numPlanesTarifa: 1,
  };
  const sinStripe = calcularOnboarding(casiTodo).categorias[0].pasos.find(p => p.id === 'reservas')!;
  assert.equal(sinStripe.done, false);
  const conStripe = calcularOnboarding({ ...casiTodo, stripeAccountId: 'acct_123' }).categorias[0].pasos.find(p => p.id === 'reservas')!;
  assert.equal(conStripe.done, true);
  assert.equal(conStripe.externo, true);
});

test('v2: "Funciones inteligentes" refleja las automatizaciones realmente activas por trigger', () => {
  const r = calcularOnboarding({ ...VACIO_V2, automatizacionesActivas: new Set(['CLASE_MANANA']) });
  const automatizaciones = r.categorias.find(c => c.id === 'automatizaciones')!;
  assert.equal(automatizaciones.pasos.find(p => p.id === 'recordatorios')!.done, true);
  assert.equal(automatizaciones.pasos.find(p => p.id === 'ausencias')!.done, false);
});

test('v2: Centro de Control no es una categoría de pasos, son enlaces sin estado done/pendiente', () => {
  const r = calcularOnboarding(VACIO_V2);
  assert.ok(!r.categorias.some(c => c.id === 'centro-control'));
  assert.ok(r.enlaces.some(e => e.href === '/informes'));
  assert.ok(r.enlaces.some(e => e.href === '/centro-de-control'));
});

test('v2: sin nada configurado, hay recomendaciones inteligentes priorizadas por Stripe primero', () => {
  const r = calcularOnboarding(VACIO_V2);
  assert.ok(r.recomendaciones.length > 0);
  assert.equal(r.recomendaciones[0].id, 'stripe');
});

test('v2: con todo resuelto, no hay recomendaciones pendientes', () => {
  const r = calcularOnboarding({
    ...VACIO_V2, stripeAccountId: 'acct_123', slug: 'mi-estudio', numPlanesTarifa: 1,
    numSesiones: 1, automatizacionesActivas: new Set(['CLASE_MANANA']),
  });
  assert.deepEqual(r.recomendaciones, []);
});

test('v2: las recomendaciones nunca contradicen un paso ya marcado como hecho', () => {
  const r = calcularOnboarding({ ...VACIO_V2, stripeAccountId: 'acct_123' });
  assert.ok(!r.recomendaciones.some(rec => rec.id === 'stripe'));
});
