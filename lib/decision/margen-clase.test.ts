import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Reserva, Sesion, Suscripcion, PlanTarifa } from '@/lib/types';
import type { SnapshotEstudio } from './tipos.ts';
import { construirIndices } from './senales.ts';
import { margenSesion, margenSesiones } from './margen-clase.ts';

const NOW = new Date('2026-07-11T12:00:00.000Z');
const diasAntes = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

let n = 0;
function reserva(p: Partial<Reserva> & Pick<Reserva, 'socioId' | 'estado' | 'sesionId'>): Reserva {
  return { id: `res-${++n}`, studioId: 'e1', spotId: null, posicionEspera: null, ofertaExpiraEn: null, checkInEn: null, creadoEn: diasAntes(1), ...p };
}
function sesion(p: Partial<Sesion> & Pick<Sesion, 'id' | 'inicio'>): Sesion {
  return { studioId: 'e1', tipoClaseId: 'tc1', salaId: 's1', instructorId: 'i1', fin: p.inicio, aforoMaximo: 8, cancelada: false, notas: null, precioPuntual: null, ...p };
}
function suscripcion(p: Partial<Suscripcion> & Pick<Suscripcion, 'socioId' | 'planId'>): Suscripcion {
  return { id: `sus-${++n}`, studioId: 'e1', estado: 'ACTIVA', fechaInicio: '2025-01-01', fechaFin: null, sesionesRestantes: null, stripeSubscriptionId: null, ...p };
}
function plan(p: Partial<PlanTarifa> & Pick<PlanTarifa, 'id'>): PlanTarifa {
  return { studioId: 'e1', nombre: 'Mensual', descripcion: null, precio: 89, tipo: 'MENSUAL', sesiones: null, activo: true, ...p };
}
function snapshot(over: Partial<SnapshotEstudio>): SnapshotEstudio {
  return {
    studioId: 'e1', socios: [], reservas: [], sesiones: [], salas: [], recibos: [],
    suscripciones: [], planesTarifa: [], tiposClase: [], instructores: [], automationLogs: [], campanas: [], sustituciones: [], instructorTarifas: new Map(), contexto: { nSociasActivas: 0, antiguedadDatosDias: 999, cadenaId: null, nSedesCadena: 1 },
    ...over,
  };
}
// Clase de 1 hora exacta, a una hora fija cualquiera.
function claseUnaHora(id: string, over: Partial<Sesion> = {}): Sesion {
  return sesion({ id, inicio: '2026-07-10T19:00:00.000Z', fin: '2026-07-10T20:00:00.000Z', ...over });
}

test('PUNTUAL con precioPuntual fijado: ingreso = asistentes × precioPuntual, sin mirar planes', () => {
  const se = claseUnaHora('s1', { precioPuntual: 20 });
  const reservas = [
    reserva({ socioId: 'soc1', estado: 'CONFIRMADA', sesionId: 's1' }),
    reserva({ socioId: 'soc2', estado: 'ASISTIDA', sesionId: 's1' }),
  ];
  const snap = snapshot({ sesiones: [se], reservas, instructorTarifas: new Map([['i1', 30]]) });
  const idx = construirIndices(snap);
  const r = margenSesion(se, snap, idx);
  assert.equal(r.asistentes, 2);
  assert.equal(r.ingresoImputado, 40);
  assert.equal(r.costeInstructora, 30); // 30€/h × 1h
  assert.equal(r.margen, 10);
});

test('BONO: ingreso por asistente = precio/sesiones del plan real de cada socia', () => {
  const se = claseUnaHora('s1');
  const p = plan({ id: 'bono10', tipo: 'BONO', precio: 100, sesiones: 10 });
  const reservas = [reserva({ socioId: 'soc1', estado: 'CONFIRMADA', sesionId: 's1' })];
  const suscripciones = [suscripcion({ socioId: 'soc1', planId: 'bono10' })];
  const snap = snapshot({ sesiones: [se], reservas, suscripciones, planesTarifa: [p] });
  const idx = construirIndices(snap);
  const r = margenSesion(se, snap, idx);
  assert.equal(r.asistentes, 1);
  assert.equal(r.ingresoImputado, 10); // 100/10
});

test('MENSUAL: ingreso por asistente según su frecuencia real, no el promedio de estudio', () => {
  const se = claseUnaHora('s1');
  const p = plan({ id: 'men1', tipo: 'MENSUAL', precio: 86.6 });
  // 8 asistencias en las últimas 8 semanas → frecuencia = 1/semana.
  const historico = Array.from({ length: 8 }, (_, i) => reserva({ socioId: 'soc1', estado: 'ASISTIDA', sesionId: `otra${i}`, creadoEn: diasAntes(i * 7 + 1) }));
  const reservas = [reserva({ socioId: 'soc1', estado: 'CONFIRMADA', sesionId: 's1' }), ...historico];
  const suscripciones = [suscripcion({ socioId: 'soc1', planId: 'men1' })];
  const snap = snapshot({ sesiones: [se], reservas, suscripciones, planesTarifa: [p] });
  const idx = construirIndices(snap);
  const r = margenSesion(se, snap, idx);
  // 86.6 / (1 × 4.33) = 20
  assert.equal(r.ingresoImputado, 20);
});

test('Sin frecuencia fiable (historial insuficiente): la socia MENSUAL no aporta ingreso, no se inventa uno', () => {
  const se = claseUnaHora('s1');
  const p = plan({ id: 'men1', tipo: 'MENSUAL', precio: 86.6 });
  const reservas = [reserva({ socioId: 'soc1', estado: 'CONFIRMADA', sesionId: 's1' })];
  const suscripciones = [suscripcion({ socioId: 'soc1', planId: 'men1' })];
  const snap = snapshot({ sesiones: [se], reservas, suscripciones, planesTarifa: [p] });
  const idx = construirIndices(snap);
  const r = margenSesion(se, snap, idx);
  assert.equal(r.ingresoImputado, 0);
});

test('Tarifa de instructora sin fijar: coste y margen quedan en null, nunca en 0€', () => {
  const se = claseUnaHora('s1', { precioPuntual: 20 });
  const reservas = [reserva({ socioId: 'soc1', estado: 'CONFIRMADA', sesionId: 's1' })];
  const snap = snapshot({ sesiones: [se], reservas }); // sin instructorTarifas
  const idx = construirIndices(snap);
  const r = margenSesion(se, snap, idx);
  assert.equal(r.ingresoImputado, 20);
  assert.equal(r.costeInstructora, null);
  assert.equal(r.margen, null);
});

test('Solo cuentan CONFIRMADA/ASISTIDA — lista de espera, pendiente y cancelada no suman ingreso ni asistentes', () => {
  const se = claseUnaHora('s1', { precioPuntual: 20 });
  const reservas = [
    reserva({ socioId: 'soc1', estado: 'CONFIRMADA', sesionId: 's1' }),
    reserva({ socioId: 'soc2', estado: 'LISTA_ESPERA', sesionId: 's1' }),
    reserva({ socioId: 'soc3', estado: 'PENDIENTE_APROBACION', sesionId: 's1' }),
    reserva({ socioId: 'soc4', estado: 'CANCELADA', sesionId: 's1' }),
    reserva({ socioId: 'soc5', estado: 'NO_ASISTIO', sesionId: 's1' }),
  ];
  const snap = snapshot({ sesiones: [se], reservas });
  const idx = construirIndices(snap);
  const r = margenSesion(se, snap, idx);
  assert.equal(r.asistentes, 1);
  assert.equal(r.ingresoImputado, 20);
});

test('margenSesiones: calcula el índice una sola vez y devuelve un resultado por sesión', () => {
  const s1 = claseUnaHora('s1', { precioPuntual: 20 });
  const s2 = sesion({ id: 's2', inicio: '2026-07-10T21:00:00.000Z', fin: '2026-07-10T22:00:00.000Z', precioPuntual: 15 });
  const reservas = [
    reserva({ socioId: 'soc1', estado: 'CONFIRMADA', sesionId: 's1' }),
    reserva({ socioId: 'soc2', estado: 'CONFIRMADA', sesionId: 's2' }),
  ];
  const snap = snapshot({ sesiones: [s1, s2], reservas });
  const resultados = margenSesiones([s1, s2], snap);
  assert.equal(resultados.length, 2);
  assert.equal(resultados[0].sesionId, 's1');
  assert.equal(resultados[0].ingresoImputado, 20);
  assert.equal(resultados[1].sesionId, 's2');
  assert.equal(resultados[1].ingresoImputado, 15);
});
