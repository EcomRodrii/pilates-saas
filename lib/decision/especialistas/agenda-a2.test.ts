import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Socio, Sesion, Sala, Suscripcion, PlanTarifa, Reserva } from '@/lib/types';
import type { SnapshotEstudio, MemoriaEstudio } from '../tipos.ts';
import { agenda } from './agenda.ts';

const NOW = new Date('2026-07-13T12:00:00.000Z');
const MS_DIA = 86400000;

let n = 0;
const socio = (id: string): Socio =>
  ({ id, studioId: 'e1', nombre: 'S', apellidos: 'B', email: 'a@b.c', telefono: null, nif: null, fechaAlta: '2025-01-01', activo: true });
const suscripcion = (socioId: string): Suscripcion =>
  ({ id: `sus-${++n}`, studioId: 'e1', socioId, planId: 'm', estado: 'ACTIVA', fechaInicio: '2025-01-01', fechaFin: null, sesionesRestantes: null, stripeSubscriptionId: null });
const plan = (): PlanTarifa => ({ id: 'm', studioId: 'e1', nombre: 'Mensual', descripcion: null, precio: 89, tipo: 'MENSUAL', sesiones: null, activo: true });
const reserva = (socioId: string, sesionId: string): Reserva =>
  ({ id: `res-${++n}`, studioId: 'e1', socioId, sesionId, estado: 'ASISTIDA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: NOW.toISOString() });

// Clase pasada `diasAtras` días, a una hora variable (para que NO formen franja
// recurrente y así aislar A2 de A1).
function clasePasada(i: number, diasAtras: number): Sesion {
  const d = new Date(NOW.getTime() - diasAtras * MS_DIA);
  d.setUTCHours(8 + (i % 6), 0, 0, 0); // horas distintas → sin recurrencia
  return { id: `ses-${i}`, studioId: 'e1', tipoClaseId: `tc-${i % 3}`, salaId: 's1', instructorId: 'i1', inicio: d.toISOString(), fin: d.toISOString(), aforoMaximo: 8, cancelada: false, notas: null, precioPuntual: null };
}

test('AGENDA A2: muchas clases pasadas casi vacías (sin franja recurrente) → FUSIONAR_SESIONES', () => {
  const socios = Array.from({ length: 5 }, (_, i) => socio(`m${i}`));
  const suscripciones = socios.map(s => suscripcion(s.id));
  // 12 clases en las últimas 4 semanas, horas distintas → A1 no agrupa ≥3.
  const sesiones = Array.from({ length: 12 }, (_, i) => clasePasada(i, 2 + i * 2));
  // Solo 2 de las 12 tienen a alguien (mayoría vacía).
  const reservas = [reserva('m0', 'ses-0'), reserva('m1', 'ses-1')];

  const snap: SnapshotEstudio = {
    studioId: 'e1', socios, reservas, sesiones, salas: [{ id: 's1', studioId: 'e1', nombre: 'Sala', capacidad: 8, color: '#000' } as Sala],
    recibos: [], suscripciones, planesTarifa: [plan()], tiposClase: [], instructores: [], automationLogs: [], campanas: [],
  };
  const c = agenda.detectar(snap, new Map() as MemoriaEstudio, NOW);
  const a2 = c.find(x => x.dedupeKey.startsWith('AGENDA:OCUPACION_BAJA'));
  assert.ok(a2, 'A2 debe disparar con la mayoría de clases vacías');
  assert.equal(a2!.tipo, 'FUSIONAR_SESIONES');
  assert.equal(a2!.riesgo, 'PERDIDA');
  assert.ok((a2!.datosUsados.clasesVacias as number) >= 5);
});

test('AGENDA A2: estudio con MUCHAS clases pero LLENAS no dispara (no falso positivo por volumen)', () => {
  const socios = Array.from({ length: 8 }, (_, i) => socio(`f${i}`));
  const suscripciones = socios.map(s => suscripcion(s.id));
  const sesiones = Array.from({ length: 15 }, (_, i) => clasePasada(i, 2 + i * 2));
  // Cada clase con 7/8 → 87% de ocupación: nada vacío pese al volumen alto.
  const reservas = sesiones.flatMap(se => socios.slice(0, 7).map(so => reserva(so.id, se.id)));
  const snap: SnapshotEstudio = {
    studioId: 'e1', socios, reservas, sesiones, salas: [{ id: 's1', studioId: 'e1', nombre: 'Sala', capacidad: 8, color: '#000' } as Sala],
    recibos: [], suscripciones, planesTarifa: [plan()], tiposClase: [], instructores: [], automationLogs: [], campanas: [],
  };
  const c = agenda.detectar(snap, new Map() as MemoriaEstudio, NOW);
  assert.equal(c.filter(x => x.dedupeKey.startsWith('AGENDA:OCUPACION_BAJA')).length, 0);
});

test('AGENDA A2: estudio recién arrancado (pocas clases) NO dispara ruido', () => {
  const sesiones = Array.from({ length: 4 }, (_, i) => clasePasada(i, 2 + i * 2)); // < A2_MIN_CLASES
  const snap: SnapshotEstudio = {
    studioId: 'e1', socios: [], reservas: [], sesiones, salas: [{ id: 's1', studioId: 'e1', nombre: 'Sala', capacidad: 8, color: '#000' } as Sala],
    recibos: [], suscripciones: [], planesTarifa: [plan()], tiposClase: [], instructores: [], automationLogs: [], campanas: [],
  };
  const c = agenda.detectar(snap, new Map() as MemoriaEstudio, NOW);
  assert.equal(c.filter(x => x.dedupeKey.startsWith('AGENDA:OCUPACION_BAJA')).length, 0);
});
