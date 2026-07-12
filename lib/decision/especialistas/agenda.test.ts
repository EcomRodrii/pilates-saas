import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Socio, Reserva, Sesion, Sala, Suscripcion, PlanTarifa } from '@/lib/types';
import type { SnapshotEstudio, MemoriaEstudio } from '../tipos.ts';
import { agenda } from './agenda.ts';

const NOW = new Date('2026-07-11T12:00:00.000Z');
const diasAntes = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

let n = 0;
function socio(p: Partial<Socio> & Pick<Socio, 'id'>): Socio {
  return { studioId: 'e1', nombre: 'Ana', apellidos: 'B', email: 'a@b.c', telefono: null, nif: null, fechaAlta: '2025-01-01', activo: true, ...p };
}
function reserva(p: Partial<Reserva> & Pick<Reserva, 'socioId' | 'estado' | 'sesionId'>): Reserva {
  return { id: `res-${++n}`, studioId: 'e1', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: diasAntes(1), ...p };
}
function sesion(p: Partial<Sesion> & Pick<Sesion, 'id' | 'inicio'>): Sesion {
  return { studioId: 'e1', tipoClaseId: 'tc1', salaId: 's1', instructorId: 'i1', fin: p.inicio, aforoMaximo: 8, cancelada: false, notas: null, precioPuntual: null, ...p };
}
function sala(p: Partial<Sala> & Pick<Sala, 'id'>): Sala {
  return { studioId: 'e1', nombre: 'Sala', capacidad: 8, color: '#000', ...p };
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
    suscripciones: [], planesTarifa: [], tiposClase: [], instructores: [], automationLogs: [], campanas: [],
    ...over,
  };
}
function memoriaVacia(): MemoriaEstudio { return new Map(); }

// Franja fija: mismo día de la semana (múltiplo de 7 días) a las 19:00 UTC, tipo tc1.
function slot(diasAtras: number): Sesion {
  const d = new Date(NOW.getTime() - diasAtras * 86400000);
  d.setUTCHours(19, 0, 0, 0);
  return sesion({ id: `ses${diasAtras}`, inicio: d.toISOString(), aforoMaximo: 8 });
}
function slotFuturo(diasDelante: number): Sesion {
  const d = new Date(NOW.getTime() + diasDelante * 86400000);
  d.setUTCHours(19, 0, 0, 0);
  return sesion({ id: `fut${diasDelante}`, inicio: d.toISOString(), aforoMaximo: 8 });
}

// Socias activas con asistencia semanal → precioMedioSesion calculable (impacto > 0).
function sociosActivos(cuantos: number): { socios: Socio[]; suscripciones: Suscripcion[]; reservas: Reserva[] } {
  const socios = Array.from({ length: cuantos }, (_, i) => socio({ id: `soc${i}` }));
  const suscripciones = socios.map(s => suscripcion({ socioId: s.id, planId: 'p1' }));
  const reservas = socios.flatMap(s => Array.from({ length: 8 }, (_, i) => reserva({ socioId: s.id, estado: 'ASISTIDA', sesionId: 'otra', creadoEn: diasAntes(i * 7 + 30) })));
  return { socios, suscripciones, reservas };
}

test('A1: franja al 25% las últimas 3 semanas y con clase futura → FUSIONAR_SESIONES', () => {
  const pasadas = [slot(7), slot(14), slot(21)];
  const futura = slotFuturo(7);
  // 2 reservas por sesión sobre aforo 8 = 25% ocupación.
  const vacias = pasadas.flatMap(se => [0, 1].map(i => reserva({ socioId: `v${se.id}${i}`, estado: 'CONFIRMADA', sesionId: se.id })));
  const base = sociosActivos(5);
  const snap = snapshot({
    sesiones: [...pasadas, futura],
    reservas: [...vacias, ...base.reservas],
    salas: [sala({ id: 's1' })],
    socios: base.socios, suscripciones: base.suscripciones, planesTarifa: [plan({ id: 'p1', precio: 89 })],
  });
  const [c] = agenda.detectar(snap, memoriaVacia(), NOW);
  assert.ok(c);
  assert.equal(c.especialista, 'AGENDA');
  assert.equal(c.tipo, 'FUSIONAR_SESIONES');
  assert.equal(c.riesgo, 'OPORTUNIDAD');
  assert.equal(c.accion.tipo, 'MARCAR_GESTIONADO');
  assert.equal(c.datosUsados.ocupacionMediaPct, 25);
  assert.ok(c.impacto && c.impacto.valor > 0);
});

test('A1: franja bien ocupada (75%) → sin candidata', () => {
  const pasadas = [slot(7), slot(14), slot(21)];
  const futura = slotFuturo(7);
  const llenas = pasadas.flatMap(se => Array.from({ length: 6 }, (_, i) => reserva({ socioId: `f${se.id}${i}`, estado: 'CONFIRMADA', sesionId: se.id })));
  const snap = snapshot({ sesiones: [...pasadas, futura], reservas: llenas, salas: [sala({ id: 's1' })] });
  assert.equal(agenda.detectar(snap, memoriaVacia(), NOW).length, 0);
});

test('A1: franja vacía pero SIN clase futura (horario retirado) → sin candidata', () => {
  const pasadas = [slot(7), slot(14), slot(21)];
  const vacias = pasadas.map(se => reserva({ socioId: `v${se.id}`, estado: 'CONFIRMADA', sesionId: se.id }));
  const snap = snapshot({ sesiones: pasadas, reservas: vacias, salas: [sala({ id: 's1' })] });
  assert.equal(agenda.detectar(snap, memoriaVacia(), NOW).length, 0);
});

test('A1: solo 2 ocurrencias pasadas (insuficiente histórico) → sin candidata', () => {
  const pasadas = [slot(7), slot(14)];
  const futura = slotFuturo(7);
  const vacias = pasadas.map(se => reserva({ socioId: `v${se.id}`, estado: 'CONFIRMADA', sesionId: se.id }));
  const snap = snapshot({ sesiones: [...pasadas, futura], reservas: vacias, salas: [sala({ id: 's1' })] });
  assert.equal(agenda.detectar(snap, memoriaVacia(), NOW).length, 0);
});

test('silencio: estudio sin sesiones no genera candidatas', () => {
  assert.equal(agenda.detectar(snapshot({}), memoriaVacia(), NOW).length, 0);
});
