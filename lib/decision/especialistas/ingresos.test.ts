import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Socio, Reserva, Sesion, Sala, Recibo, Suscripcion, PlanTarifa } from '@/lib/types';
import type { SnapshotEstudio, MemoriaEstudio } from '../tipos.ts';
import { ingresos } from './ingresos.ts';

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
function recibo(p: Partial<Recibo> & Pick<Recibo, 'estado'>): Recibo {
  return { id: `rec-${++n}`, studioId: 'e1', socioId: null, suscripcionId: null, concepto: 'Cuota', importe: 90, fechaVencimiento: diasAntes(5), fechaCobro: null, fechaDevolucion: null, intentosReintento: 0, ...p };
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

function slot(diasAtras: number, salaId = 's1'): Sesion {
  const d = new Date(NOW.getTime() - diasAtras * 86400000);
  d.setUTCHours(19, 0, 0, 0);
  return sesion({ id: `ses-${diasAtras}`, inicio: d.toISOString(), aforoMaximo: 8, salaId });
}

test('I1: franja llena 3 semanas + lista de espera + sala libre → ABRIR_SESION', () => {
  const sesiones = [slot(7), slot(14), slot(21)];
  const reservasLlenas = sesiones.flatMap(se => Array.from({ length: 8 }, (_, i) => reserva({ socioId: `s${se.id}${i}`, estado: 'CONFIRMADA', sesionId: se.id })));
  const listaEspera = sesiones.flatMap(se => [0, 1].map(i => reserva({ socioId: `w${se.id}${i}`, estado: 'LISTA_ESPERA', sesionId: se.id })));
  const socios = Array.from({ length: 5 }, (_, i) => socio({ id: `soc${i}` }));
  const suscripciones = socios.map(s => suscripcion({ socioId: s.id, planId: 'p1' }));
  // Asistencia regular (1x/semana) para que frecuenciaHabitual sea válida y
  // precioMedioSesion pueda calcularse (Especialistas §2.2).
  const asistenciasSocios = socios.flatMap(s => Array.from({ length: 8 }, (_, i) => reserva({ socioId: s.id, estado: 'ASISTIDA', sesionId: 'otra', creadoEn: diasAntes(i * 7 + 40) })));
  const salas = [sala({ id: 's1', capacidad: 8 }), sala({ id: 's2', capacidad: 8 })];
  const snap = snapshot({
    sesiones, reservas: [...reservasLlenas, ...listaEspera, ...asistenciasSocios], salas, socios, suscripciones, planesTarifa: [plan({ id: 'p1', precio: 89 })],
  });
  const candidatas = ingresos.detectar(snap, memoriaVacia(), NOW);
  const abrir = candidatas.find(c => c.tipo === 'ABRIR_SESION');
  assert.ok(abrir);
  assert.equal(abrir.riesgo, 'OPORTUNIDAD');
  assert.ok(abrir.impacto && abrir.impacto.valor > 0);
});

test('I1: sin sala libre (una sola sala, ya ocupada) → sin candidata', () => {
  const sesiones = [slot(7), slot(14), slot(21)];
  const reservasLlenas = sesiones.flatMap(se => Array.from({ length: 8 }, (_, i) => reserva({ socioId: `s${se.id}${i}`, estado: 'CONFIRMADA', sesionId: se.id })));
  const listaEspera = sesiones.map(se => reserva({ socioId: `w${se.id}`, estado: 'LISTA_ESPERA', sesionId: se.id }));
  const salas = [sala({ id: 's1', capacidad: 8 })]; // única sala, ya usada por la franja
  const snap = snapshot({ sesiones, reservas: [...reservasLlenas, ...listaEspera], salas });
  const candidatas = ingresos.detectar(snap, memoriaVacia(), NOW);
  assert.equal(candidatas.find(c => c.tipo === 'ABRIR_SESION'), undefined);
});

test('I1: solo 1 semana llena (no consecutivas suficientes) → sin candidata', () => {
  const sesiones = [slot(7), slot(14), slot(21)];
  const reservas = [
    ...Array.from({ length: 8 }, (_, i) => reserva({ socioId: `a${i}`, estado: 'CONFIRMADA', sesionId: sesiones[0].id })),
    ...Array.from({ length: 3 }, (_, i) => reserva({ socioId: `b${i}`, estado: 'CONFIRMADA', sesionId: sesiones[1].id })),
    ...Array.from({ length: 2 }, (_, i) => reserva({ socioId: `c${i}`, estado: 'CONFIRMADA', sesionId: sesiones[2].id })),
  ];
  const salas = [sala({ id: 's1' }), sala({ id: 's2' })];
  const snap = snapshot({ sesiones, reservas, salas });
  const candidatas = ingresos.detectar(snap, memoriaVacia(), NOW);
  assert.equal(candidatas.find(c => c.tipo === 'ABRIR_SESION'), undefined);
});

test('I2: pagos pendientes con tarjeta → una sola candidata agregada (nunca N tarjetas)', () => {
  const socios = [
    socio({ id: 'a', stripeCustomerId: 'cus_a', stripePaymentMethodId: 'pm_a' }),
    socio({ id: 'b', stripeCustomerId: 'cus_b', stripePaymentMethodId: 'pm_b' }),
  ];
  const recibos = [
    recibo({ estado: 'PENDIENTE', socioId: 'a', importe: 60, fechaVencimiento: diasAntes(3) }),
    recibo({ estado: 'PENDIENTE', socioId: 'b', importe: 120, fechaVencimiento: diasAntes(5) }),
  ];
  const snap = snapshot({ socios, recibos });
  const candidatas = ingresos.detectar(snap, memoriaVacia(), NOW);
  const pagos = candidatas.filter(c => c.tipo === 'RECUPERAR_PAGOS');
  assert.equal(pagos.length, 1);
  assert.equal(pagos[0].accion.tipo === 'COBRAR_RECIBOS' && pagos[0].accion.reciboIds.length, 2);
  assert.equal(pagos[0].impacto?.valor, 180);
  assert.equal(pagos[0].riesgo, 'PERDIDA');
});

test('I2: sin tarjeta guardada → sin candidata RECUPERAR_PAGOS', () => {
  const socios = [socio({ id: 'a' })];
  const recibos = [recibo({ estado: 'PENDIENTE', socioId: 'a', fechaVencimiento: diasAntes(3) })];
  const snap = snapshot({ socios, recibos });
  const candidatas = ingresos.detectar(snap, memoriaVacia(), NOW);
  assert.equal(candidatas.find(c => c.tipo === 'RECUPERAR_PAGOS'), undefined);
});

test('silencio: estudio sin datos suficientes no genera candidatas', () => {
  const snap = snapshot({});
  assert.equal(ingresos.detectar(snap, memoriaVacia(), NOW).length, 0);
});
