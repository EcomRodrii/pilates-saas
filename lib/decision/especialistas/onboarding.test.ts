import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PlanTarifa, Socio, Reserva, Suscripcion } from '@/lib/types';
import type { SnapshotEstudio, MemoriaEstudio, IntentoFallidoSnapshot } from '../tipos.ts';
import { onboarding } from './onboarding.ts';

const NOW = new Date('2026-07-11T12:00:00.000Z');
const diasAntes = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

let n = 0;
const socio = (p: Partial<Socio> & Pick<Socio, 'id'>): Socio =>
  ({ studioId: 'e1', nombre: 'Socia', apellidos: 'B', email: 'a@b.c', telefono: null, nif: null, fechaAlta: diasAntes(10), activo: true, ...p });
const reserva = (p: Partial<Reserva> & Pick<Reserva, 'socioId' | 'sesionId' | 'creadoEn'>): Reserva =>
  ({ id: `res-${++n}`, studioId: 'e1', estado: 'ASISTIDA', spotId: null, posicionEspera: null, ofertaExpiraEn: null, checkInEn: null, ...p });

// Sus 30 días cuentan desde su PRIMERA COMPRA (su estado, lib/clientas/estado.ts),
// no desde que se creó su ficha.
const PLAN_MENSUAL = { id: 'mensual', studioId: 'e1', nombre: 'Mensual', descripcion: null, precio: 60, tipo: 'MENSUAL', sesiones: null, activo: true } as PlanTarifa;
const cuota = (socioId: string, diasDesdeCompra: number): Suscripcion =>
  ({ id: `sus-${++n}`, studioId: 'e1', socioId, planId: 'mensual', estado: 'ACTIVA', fechaInicio: diasAntes(diasDesdeCompra).slice(0, 10), fechaFin: diasAntes(diasDesdeCompra - 30).slice(0, 10), sesionesRestantes: null, stripeSubscriptionId: null });

function snap(socios: Socio[], reservas: Reserva[] = [], intentosFallidos: IntentoFallidoSnapshot[] = [], suscripciones: Suscripcion[] = []): SnapshotEstudio {
  return {
    studioId: 'e1', socios, reservas, sesiones: [], salas: [], recibos: [],
    suscripciones, planesTarifa: [PLAN_MENSUAL], tiposClase: [], instructores: [], automationLogs: [], campanas: [], sustituciones: [], instructorTarifas: [], intentosFallidos, bloqueosAgenda: [], widgetEventosCheckout: [], contactosManuales: [], hechosClientas: {},
    contexto: { nSociasActivas: 0, antiguedadDatosDias: 999, cadenaId: null, nSedesCadena: 1 },
  };
}
const detectar = (s: SnapshotEstudio) => onboarding.detectar(s, new Map() as MemoriaEstudio, NOW);

test('ONBOARDING: empezó hace 25 días sin venir, ventana casi cerrada → IMPULSAR_ONBOARDING (desde la compra, no desde la ficha)', () => {
  // La ficha es de hace 60 días; empezó (primera compra) hace 25.
  const c = detectar(snap([socio({ id: 's1', fechaAlta: diasAntes(60) })], [], [], [cuota('s1', 25)]));
  assert.equal(c.length, 1);
  assert.equal(c[0].tipo, 'IMPULSAR_ONBOARDING');
  assert.equal(c[0].especialista, 'ONBOARDING');
  assert.equal(c[0].socioId, 's1');
  assert.equal(c[0].datosUsados.visitas, 0);
  assert.equal(c[0].datosUsados.diasRestantes, 5);
  assert.match(c[0].motivoMotor, /empezó hace 25 días/);
});

test('ONBOARDING: día 10 (ventana lejos de cerrar) aunque sin visitas → sin candidata todavía', () => {
  const c = detectar(snap([socio({ id: 's1' })], [], [], [cuota('s1', 10)]));
  assert.equal(c.length, 0);
});

test('ONBOARDING: ya cumplió las 4 visitas Y las 2 conocidas → sin candidata (el objetivo es compuesto, no basta con una mitad)', () => {
  const s = socio({ id: 's1', fechaAlta: diasAntes(25) });
  const c1 = socio({ id: 'c1', fechaAlta: diasAntes(22), referidoPor: 's1' });
  const c2 = socio({ id: 'c2', fechaAlta: diasAntes(21), referidoPor: 's1' });
  const reservas = [
    ...Array.from({ length: 4 }, (_, i) => reserva({ socioId: 's1', sesionId: `ses${i}`, creadoEn: diasAntes(20 - i) })),
    reserva({ socioId: 'c1', sesionId: 'sesC1', creadoEn: diasAntes(20) }),
    reserva({ socioId: 'c2', sesionId: 'sesC2', creadoEn: diasAntes(19) }),
  ];
  const c = detectar(snap([s, c1, c2], reservas, [], [cuota('s1', 25)]));
  assert.equal(c.filter(x => x.socioId === 's1').length, 0);
});

test('ONBOARDING: trajo 2 conocidas con su primera asistencia dentro de la ventana → cuenta como conocidas', () => {
  const referidora = socio({ id: 'ref', fechaAlta: diasAntes(25) });
  const conocida1 = socio({ id: 'c1', fechaAlta: diasAntes(20), referidoPor: 'ref' });
  const conocida2 = socio({ id: 'c2', fechaAlta: diasAntes(15), referidoPor: 'ref' });
  const reservas = [
    reserva({ socioId: 'c1', sesionId: 'sesA', creadoEn: diasAntes(18) }),
    reserva({ socioId: 'c2', sesionId: 'sesB', creadoEn: diasAntes(12) }),
  ];
  const c = detectar(snap([referidora, conocida1, conocida2], reservas, [], [cuota('ref', 25)]));
  // Sigue faltando visitas propias (0 < 4), pero conocidas ya llegan a 2.
  assert.equal(c.length, 1);
  assert.equal(c[0].datosUsados.conocidas, 2);
});

test('ONBOARDING: quien nunca compró (interesada o de prueba) no es de este especialista', () => {
  const c = detectar(snap([socio({ id: 's1', fechaAlta: diasAntes(25) })]));
  assert.equal(c.length, 0);
});

test('ONBOARDING: una veterana migrada con historial que compra aquí por primera vez no es «nueva»', () => {
  const c = detectar(snap([socio({ id: 's1', fechaAlta: diasAntes(25), leadStage: 'ACTIVA' })], [], [], [cuota('s1', 25)]));
  assert.equal(c.length, 0);
});

test('ONBOARDING: socia de baja no genera candidata', () => {
  const c = detectar(snap([socio({ id: 's1', fechaAlta: diasAntes(25), activo: false })], [], [], [cuota('s1', 25)]));
  assert.equal(c.length, 0);
});

test('ONBOARDING: pasados los 30 días desde que empezó ya no es ventana de onboarding', () => {
  const c = detectar(snap([socio({ id: 's1', fechaAlta: diasAntes(35) })], [], [], [cuota('s1', 35)]));
  assert.equal(c.length, 0);
});

test('ONBOARDING: nunca sube a confianza ALTA (autonomía máxima 1)', () => {
  const c = detectar(snap([socio({ id: 's1', fechaAlta: diasAntes(29) })], [], [], [cuota('s1', 29)]));
  assert.equal(c.length, 1);
  assert.notEqual(c[0].confianza.nivel, 'ALTA');
  assert.ok(c[0].confianza.autonomiaMaxima <= 1);
});

test('O2: una interesada (aún sin plan) que intenta reservar y no puede también avisa — quiere venir', () => {
  const s1 = socio({ id: 's1', fechaAlta: diasAntes(5), leadStage: 'LEAD' });
  const intentos: IntentoFallidoSnapshot[] = [
    { id: 'if-1', socioId: 's1', sesionId: null, tipoClaseId: null, motivo: 'SIN_PLAN', creadoEn: diasAntes(1) },
    { id: 'if-2', socioId: 's1', sesionId: null, tipoClaseId: null, motivo: 'SIN_PLAN', creadoEn: diasAntes(2) },
  ];
  const c = detectar(snap([s1], [], intentos));
  assert.equal(c[0]?.tipo, 'RIESGO_RESERVA_FALLIDA');
});

test('O2: socia nueva (día 5) con 2 intentos de reserva fallidos → RIESGO_RESERVA_FALLIDA', () => {
  const s1 = socio({ id: 's1', fechaAlta: diasAntes(5) });
  const intentos: IntentoFallidoSnapshot[] = [
    { id: 'if-1', socioId: 's1', sesionId: null, tipoClaseId: null, motivo: 'SIN_PLAN', creadoEn: diasAntes(1) },
    { id: 'if-2', socioId: 's1', sesionId: null, tipoClaseId: null, motivo: 'PLAN_NO_INCLUYE_TIPO', creadoEn: diasAntes(2) },
  ];
  const c = detectar(snap([s1], [], intentos));
  assert.equal(c.length, 1);
  assert.equal(c[0].tipo, 'RIESGO_RESERVA_FALLIDA');
  assert.equal(c[0].datosUsados.intentosFallidos, 2);
  // Motivos mezclados (no todos SIN_PLAN) → mensaje genérico de fricción real.
  assert.equal(c[0].datosUsados.soloFaltaPlan, false);
  assert.match(c[0].tituloMotor, /no consigue reservar/);
});

test('O2: todos los intentos son SIN_PLAN → mensaje distinto, "aún no tiene plan asignado" en vez de "no consigue reservar"', () => {
  const s1 = socio({ id: 's1', fechaAlta: diasAntes(5) });
  const intentos: IntentoFallidoSnapshot[] = [
    { id: 'if-1', socioId: 's1', sesionId: null, tipoClaseId: null, motivo: 'SIN_PLAN', creadoEn: diasAntes(1) },
    { id: 'if-2', socioId: 's1', sesionId: null, tipoClaseId: null, motivo: 'SIN_PLAN', creadoEn: diasAntes(2) },
  ];
  const c = detectar(snap([s1], [], intentos));
  assert.equal(c.length, 1);
  assert.equal(c[0].datosUsados.soloFaltaPlan, true);
  assert.match(c[0].tituloMotor, /aún no tiene plan asignado/);
  assert.doesNotMatch(c[0].tituloMotor, /no consigue reservar/);
});

test('O2: pasados los 30 días, los intentos fallidos ya no son cosa de onboarding (los cubre RETENCION)', () => {
  const s1 = socio({ id: 's1', fechaAlta: diasAntes(35) });
  const intentos: IntentoFallidoSnapshot[] = [
    { id: 'if-1', socioId: 's1', sesionId: null, tipoClaseId: null, motivo: 'SIN_PLAN', creadoEn: diasAntes(1) },
    { id: 'if-2', socioId: 's1', sesionId: null, tipoClaseId: null, motivo: 'SIN_PLAN', creadoEn: diasAntes(2) },
  ];
  const c = detectar(snap([s1], [], intentos));
  assert.equal(c.length, 0);
});
