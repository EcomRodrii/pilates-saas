// Tests de los tres tipos de recomendación que existían en el catálogo
// (TipoRecomendacion) pero que NINGÚN especialista generaba — eran "fachada":
//   CONGELAR_MEMBRESIA (Retención R6), REVISAR_PRECIO (Ingresos I4),
//   MOVER_HORARIO (Agenda A3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Socio, Suscripcion, PlanTarifa, Sesion, Reserva, Recibo, TipoClase } from '@/lib/types';
import type { SnapshotEstudio, MemoriaEstudio } from '../tipos.ts';
import { retencion } from './retencion.ts';
import { ingresos } from './ingresos.ts';
import { agenda } from './agenda.ts';

const NOW = new Date('2026-07-13T12:00:00.000Z'); // lunes
const iso = (d: string) => new Date(d).toISOString();
const diasAntes = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();
let n = 0;

const socio = (p: Partial<Socio> & Pick<Socio, 'id'>): Socio =>
  ({ studioId: 'e1', nombre: 'Ana', apellidos: 'G', email: 'a@b.c', telefono: null, nif: null, fechaAlta: diasAntes(120), activo: true, ...p });
const plan = (p: Partial<PlanTarifa> & Pick<PlanTarifa, 'id' | 'tipo'>): PlanTarifa =>
  ({ studioId: 'e1', nombre: 'Plan', descripcion: null, precio: 60, sesiones: null, activo: true, ...p });
const sus = (socioId: string, planId: string, p: Partial<Suscripcion> = {}): Suscripcion =>
  ({ id: `sus-${++n}`, studioId: 'e1', socioId, planId, estado: 'ACTIVA', fechaInicio: diasAntes(90), fechaFin: null, sesionesRestantes: null, stripeSubscriptionId: null, ...p });
const sesion = (id: string, tipoClaseId: string, inicio: string, aforoMaximo = 8): Sesion =>
  ({ id, studioId: 'e1', tipoClaseId, salaId: 's1', instructorId: 'i1', inicio, fin: inicio, aforoMaximo, cancelada: false, notas: null, precioPuntual: null });
const asistida = (socioId: string, sesionId: string, creadoEn: string): Reserva =>
  ({ id: `r-${++n}`, studioId: 'e1', socioId, sesionId, estado: 'ASISTIDA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn });
const tipoClase = (id: string, nombre: string): TipoClase =>
  ({ id, studioId: 'e1', nombre, color: '#000', duracionMinutos: 50, descripcion: null, nivel: 'TODOS', fotoUrl: null });
const recibo = (socioId: string, p: Partial<Recibo> = {}): Recibo =>
  ({ id: `rec-${++n}`, studioId: 'e1', socioId, suscripcionId: null, concepto: 'cuota', importe: 60, estado: 'PENDIENTE', fechaVencimiento: diasAntes(10), fechaCobro: null, fechaDevolucion: null, intentosReintento: 0, ...p });

function snap(p: Partial<SnapshotEstudio>): SnapshotEstudio {
  return { studioId: 'e1', socios: [], reservas: [], sesiones: [], salas: [], recibos: [], suscripciones: [], planesTarifa: [], tiposClase: [], instructores: [], automationLogs: [], campanas: [], ...p };
}
const M = new Map() as MemoriaEstudio;

// ── CONGELAR_MEMBRESIA (Retención R6) ────────────────────────────────────────
test('CONGELAR: MENSUAL al corriente pero 50 días sin venir → CONGELAR_MEMBRESIA', () => {
  const s = snap({
    socios: [socio({ id: '1', nombre: 'Lucía', fechaAlta: diasAntes(200) })],
    planesTarifa: [plan({ id: 'm', tipo: 'MENSUAL', precio: 55 })],
    suscripciones: [sus('1', 'm', { fechaInicio: diasAntes(200), fechaFin: null })],
    sesiones: [sesion('se1', 'T', diasAntes(50))],
    reservas: [asistida('1', 'se1', diasAntes(50))], // última asistencia hace 50 días
  });
  const c = retencion.detectar(s, M, NOW);
  assert.equal(c.length, 1);
  assert.equal(c[0].tipo, 'CONGELAR_MEMBRESIA');
  assert.equal(c[0].especialista, 'RETENCION');
  assert.equal(c[0].socioId, '1');
});

test('CONGELAR: si tiene un recibo vencido no dispara (es cobro, no congelación)', () => {
  const s = snap({
    socios: [socio({ id: '1', fechaAlta: diasAntes(200) })],
    planesTarifa: [plan({ id: 'm', tipo: 'MENSUAL', precio: 55 })],
    suscripciones: [sus('1', 'm', { fechaInicio: diasAntes(200), fechaFin: null })],
    sesiones: [sesion('se1', 'T', diasAntes(50))],
    reservas: [asistida('1', 'se1', diasAntes(50))],
    recibos: [recibo('1', { fechaVencimiento: diasAntes(10) })],
  });
  assert.equal(retencion.detectar(s, M, NOW).length, 0);
});

test('CONGELAR: viniendo hace poco no dispara', () => {
  const s = snap({
    socios: [socio({ id: '1', fechaAlta: diasAntes(200) })],
    planesTarifa: [plan({ id: 'm', tipo: 'MENSUAL', precio: 55 })],
    suscripciones: [sus('1', 'm', { fechaInicio: diasAntes(200), fechaFin: null })],
    sesiones: [sesion('se1', 'T', diasAntes(3))],
    reservas: [asistida('1', 'se1', diasAntes(3))],
  });
  assert.equal(retencion.detectar(s, M, NOW).length, 0);
});

// ── REVISAR_PRECIO (Ingresos I4) ─────────────────────────────────────────────
// 3 socias en un plan barato que vienen mucho (precio/sesión muy bajo) + 3 en un
// plan caro que vienen poco → la media del estudio sube y el plan barato queda
// claramente por debajo del 55%.
function conAsistencias(socioId: string, sesId: string, cuantas: number): Reserva[] {
  return Array.from({ length: cuantas }, (_, i) => asistida(socioId, sesId, diasAntes(1 + i * 7)));
}

test('REVISAR_PRECIO: plan MENSUAL barato y muy usado por 3+ socias → REVISAR_PRECIO', () => {
  const sesiones = [sesion('seA', 'T', diasAntes(1)), sesion('seB', 'T', diasAntes(1))];
  const baratas = ['a1', 'a2', 'a3'];
  const caras = ['b1', 'b2', 'b3'];
  const reservas = [
    ...baratas.flatMap(id => conAsistencias(id, 'seA', 8)), // freq ≈ 1.0/sem
    ...caras.flatMap(id => conAsistencias(id, 'seB', 4)),   // freq ≈ 0.5/sem
  ];
  const s = snap({
    socios: [...baratas, ...caras].map(id => socio({ id })),
    planesTarifa: [plan({ id: 'barato', tipo: 'MENSUAL', precio: 20 }), plan({ id: 'caro', tipo: 'MENSUAL', precio: 80 })],
    suscripciones: [...baratas.map(id => sus(id, 'barato')), ...caras.map(id => sus(id, 'caro'))],
    sesiones, reservas,
  });
  const c = ingresos.detectar(s, M, NOW);
  const rev = c.find(x => x.tipo === 'REVISAR_PRECIO');
  assert.ok(rev, 'debería emitir REVISAR_PRECIO');
  assert.equal(rev!.datosUsados.plan, 'Plan'); // nombre por defecto del plan barato
  assert.equal(rev!.especialista, 'INGRESOS');
  assert.equal(rev!.riesgo, 'OPORTUNIDAD');
});

test('REVISAR_PRECIO: con menos de 3 socias en el plan no dispara', () => {
  const sesiones = [sesion('seA', 'T', diasAntes(1)), sesion('seB', 'T', diasAntes(1))];
  const reservas = [
    ...['a1', 'a2'].flatMap(id => conAsistencias(id, 'seA', 8)),
    ...['b1', 'b2', 'b3'].flatMap(id => conAsistencias(id, 'seB', 4)),
  ];
  const s = snap({
    socios: ['a1', 'a2', 'b1', 'b2', 'b3'].map(id => socio({ id })),
    planesTarifa: [plan({ id: 'barato', tipo: 'MENSUAL', precio: 20 }), plan({ id: 'caro', tipo: 'MENSUAL', precio: 80 })],
    suscripciones: [...['a1', 'a2'].map(id => sus(id, 'barato')), ...['b1', 'b2', 'b3'].map(id => sus(id, 'caro'))],
    sesiones, reservas,
  });
  assert.equal(ingresos.detectar(s, M, NOW).some(x => x.tipo === 'REVISAR_PRECIO'), false);
});

// ── MOVER_HORARIO (Agenda A3) ────────────────────────────────────────────────
// Franja X (lun 10:00) va vacía; franja Y (mié 19:00) del MISMO tipo se llena.
const franjaVacia: Sesion[] = [
  sesion('x1', 'T', iso('2026-07-06T10:00:00Z')),
  sesion('x2', 'T', iso('2026-06-29T10:00:00Z')),
  sesion('x3', 'T', iso('2026-06-22T10:00:00Z')),
  sesion('xf', 'T', iso('2026-07-20T10:00:00Z')), // futura → la franja sigue viva
];
const franjaLlena: Sesion[] = [
  sesion('y1', 'T', iso('2026-07-08T19:00:00Z')),
  sesion('y2', 'T', iso('2026-07-01T19:00:00Z')),
  sesion('y3', 'T', iso('2026-06-24T19:00:00Z')),
];
const reservasX = ['x1', 'x2', 'x3'].map(se => asistida('s-x', se, diasAntes(20))); // 1/8 → vacía
const reservasY = ['y1', 'y2', 'y3'].flatMap(se => Array.from({ length: 7 }, (_, i) => asistida(`s-y${i}`, se, diasAntes(10)))); // 7/8 → llena

test('MOVER_HORARIO: franja vacía + mismo tipo lleno en otra hora → MOVER_HORARIO (gana a FUSIONAR)', () => {
  const s = snap({
    tiposClase: [tipoClase('T', 'Reformer')],
    sesiones: [...franjaVacia, ...franjaLlena],
    reservas: [...reservasX, ...reservasY],
  });
  const c = agenda.detectar(s, M, NOW);
  assert.equal(c.length, 1);
  assert.equal(c[0].tipo, 'MOVER_HORARIO');
  assert.equal(c[0].datosUsados.tipoClase, 'Reformer');
});

test('MOVER_HORARIO: sin alternativa llena, cae a FUSIONAR_SESIONES (no MOVER)', () => {
  // Sin la franja llena: la vacía solo puede fusionarse.
  const s = snap({
    tiposClase: [tipoClase('T', 'Reformer')],
    sesiones: franjaVacia,
    reservas: reservasX,
  });
  const c = agenda.detectar(s, M, NOW);
  assert.equal(c.some(x => x.tipo === 'MOVER_HORARIO'), false);
  assert.equal(c[0].tipo, 'FUSIONAR_SESIONES');
});
