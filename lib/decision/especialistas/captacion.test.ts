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

function snap(socios: Socio[], suscripciones: Suscripcion[] = []): SnapshotEstudio {
  return {
    studioId: 'e1', socios, reservas: [], sesiones: [], salas: [], recibos: [],
    suscripciones, planesTarifa: [], tiposClase: [], instructores: [], automationLogs: [], campanas: [],
  };
}
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
