import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Socio, Suscripcion } from '@/lib/types';
import type { SnapshotEstudio, MemoriaEstudio } from '../tipos.ts';
import { captacion } from './captacion.ts';

const NOW = new Date('2026-07-11T12:00:00.000Z');
const diasAntes = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

let n = 0;
const socio = (p: Partial<Socio> & Pick<Socio, 'id'>): Socio =>
  ({ studioId: 'e1', nombre: 'Socia', apellidos: 'B', email: 'a@b.c', telefono: null, nif: null, fechaAlta: diasAntes(10), activo: true, ...p });
const suscripcion = (socioId: string): Suscripcion =>
  ({ id: `sus-${++n}`, studioId: 'e1', socioId, planId: 'p', estado: 'ACTIVA', fechaInicio: diasAntes(5), fechaFin: null, sesionesRestantes: null, stripeSubscriptionId: null });

function snap(socios: Socio[], suscripciones: Suscripcion[] = [], widgetEventosCheckout: SnapshotEstudio['widgetEventosCheckout'] = []): SnapshotEstudio {
  return {
    studioId: 'e1', socios, reservas: [], sesiones: [], salas: [], recibos: [],
    suscripciones, planesTarifa: [], tiposClase: [], instructores: [], automationLogs: [], campanas: [], sustituciones: [], instructorTarifas: [], intentosFallidos: [], bloqueosAgenda: [], widgetEventosCheckout, contexto: { nSociasActivas: 0, antiguedadDatosDias: 999, cadenaId: null, nSedesCadena: 1 },
  };
}

type EventoTipo = 'checkout_started' | 'booking_completed';
// Ventana base: 20-50 días atrás. Ventana reciente: 1-13 días atrás.
const evento = (tipo: EventoTipo, sessionId: string, diasAtras: number) =>
  ({ sessionId, tipo, creadoEn: diasAntes(diasAtras) }) as { sessionId: string; tipo: EventoTipo; creadoEn: string };

// n sesiones en la ventana BASE (20-50d) con tasa de éxito dada (0..1).
function eventosBase(n: number, tasaExito: number): ReturnType<typeof evento>[] {
  const out: ReturnType<typeof evento>[] = [];
  for (let i = 0; i < n; i++) {
    const sid = `base-${i}`;
    out.push(evento('checkout_started', sid, 30));
    if (i < Math.round(n * tasaExito)) out.push(evento('booking_completed', sid, 30));
  }
  return out;
}
// n sesiones en la ventana RECIENTE (1-13d) con tasa de éxito dada (0..1).
function eventosRecientes(n: number, tasaExito: number): ReturnType<typeof evento>[] {
  const out: ReturnType<typeof evento>[] = [];
  for (let i = 0; i < n; i++) {
    const sid = `reciente-${i}`;
    out.push(evento('checkout_started', sid, 5));
    if (i < Math.round(n * tasaExito)) out.push(evento('booking_completed', sid, 5));
  }
  return out;
}

test('CAPTACION C3: sin ventana base (estudio nuevo/widget recién activado) no dispara', () => {
  const c = detectar(snap([], [], eventosRecientes(10, 0.3)));
  assert.equal(c.filter(x => x.tipo === 'REVISAR_ABANDONO_CHECKOUT').length, 0);
});

test('CAPTACION C3: muestra reciente insuficiente (<5 checkouts) no dispara', () => {
  const c = detectar(snap([], [], [...eventosBase(10, 0.9), ...eventosRecientes(3, 0.2)]));
  assert.equal(c.filter(x => x.tipo === 'REVISAR_ABANDONO_CHECKOUT').length, 0);
});

test('CAPTACION C3: tasa reciente similar a la habitual del estudio no dispara', () => {
  const c = detectar(snap([], [], [...eventosBase(20, 0.85), ...eventosRecientes(10, 0.8)]));
  assert.equal(c.filter(x => x.tipo === 'REVISAR_ABANDONO_CHECKOUT').length, 0);
});

test('CAPTACION C3: tasa reciente caída clara frente a su propio histórico → REVISAR_ABANDONO_CHECKOUT', () => {
  const c = detectar(snap([], [], [...eventosBase(20, 0.9), ...eventosRecientes(10, 0.1)]));
  const cand = c.find(x => x.tipo === 'REVISAR_ABANDONO_CHECKOUT');
  assert.ok(cand, 'debería generar la candidata de abandono de checkout');
  assert.equal(cand?.especialista, 'CAPTACION');
  assert.ok(!cand?.socioId, 'es agregada, no debe llevar socioId');
  assert.notEqual(cand?.confianza.nivel, 'ALTA', 'techo MEDIA a propósito, nunca ALTA');
});

test('CAPTACION C3: un estudio con conversión históricamente baja (60%) no se marca por comparar contra un corte fijo', () => {
  // Reciente igual de "malo" que siempre para ESTE estudio → sin caída relativa → no dispara.
  const c = detectar(snap([], [], [...eventosBase(20, 0.6), ...eventosRecientes(10, 0.55)]));
  assert.equal(c.filter(x => x.tipo === 'REVISAR_ABANDONO_CHECKOUT').length, 0);
});
const detectar = (s: SnapshotEstudio) => captacion.detectar(s, new Map() as MemoriaEstudio, NOW);

test('CAPTACION: lead sin seguimiento (10 días, sin contacto) → CONTACTAR_LEAD', () => {
  const c = detectar(snap([socio({ id: 'l1', nombre: 'Lea', leadStage: 'LEAD' })]));
  assert.equal(c.length, 1);
  assert.equal(c[0].tipo, 'CONTACTAR_LEAD');
  assert.equal(c[0].especialista, 'CAPTACION');
  assert.equal(c[0].socioId, 'l1');
});

test('CAPTACION: interesada también dispara CONTACTAR_LEAD', () => {
  const c = detectar(snap([socio({ id: 'i1', nombre: 'Ina', leadStage: 'INTERESADA' })]));
  assert.equal(c[0]?.tipo, 'CONTACTAR_LEAD');
});

test('CAPTACION: prueba sin plan → CONVERTIR_PRUEBA', () => {
  const c = detectar(snap([socio({ id: 'p1', nombre: 'Pru', leadStage: 'PRUEBA' })]));
  assert.equal(c.length, 1);
  assert.equal(c[0].tipo, 'CONVERTIR_PRUEBA');
});

test('CAPTACION: prueba que YA convirtió (suscripción activa) no dispara', () => {
  const c = detectar(snap([socio({ id: 'p2', nombre: 'Pru2', leadStage: 'PRUEBA' })], [suscripcion('p2')]));
  assert.equal(c.length, 0);
});

test('CAPTACION: lead con suscripción activa ya está dentro → no es captación', () => {
  const c = detectar(snap([socio({ id: 'l2', nombre: 'Lea2', leadStage: 'LEAD' })], [suscripcion('l2')]));
  assert.equal(c.length, 0);
});

test('CAPTACION: socia ACTIVA sin etapa de entrada no genera nada', () => {
  const c = detectar(snap([socio({ id: 'a1', nombre: 'Act', leadStage: 'ACTIVA' })], [suscripcion('a1')]));
  assert.equal(c.length, 0);
});

test('CAPTACION: lead recién creado (2 días) aún no madura, pero sin contacto → BAJA (dispara)', () => {
  // leadMadurado=false, sinContactoReciente=true → confianza BAJA → sí genera candidata (visible, prioridad baja).
  const c = detectar(snap([socio({ id: 'l3', nombre: 'Nueva', leadStage: 'LEAD', fechaAlta: diasAntes(2) })]));
  assert.equal(c[0]?.tipo, 'CONTACTAR_LEAD');
  assert.equal(c[0]?.confianza.nivel, 'BAJA');
});

// P2-5: leadStage vacío tras una migración desde otra plataforma (el
// importador antiguo no lo rellenaba) — el especialista NO debe romper ni
// tratar a estas socias como leads nuevos. El fix real vive en el
// importador (app/api/socios/import/route.ts, rellena 'ACTIVA'); esto es el
// test de regresión que blinda el especialista si el fix llegara a fallar.
test('CAPTACION: leadStage indefinido (dato ya migrado sin rellenar) no dispara ni rompe', () => {
  const c = detectar(snap([socio({ id: 'm1', nombre: 'Migrada' })]));
  assert.equal(c.length, 0);
});
