import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Socio, Reserva, Suscripcion, PlanTarifa, Recibo, Sesion, AutomationLog } from '@/lib/types';
import type { SnapshotEstudio } from './tipos.ts';
import {
  construirIndices, frecuenciaHabitual, frecuenciaHabitualPorTipoClase, diasSinVenir, umbralAnomalo, ausenciaAnomala,
  renovacionProxima, valorMensual, diasDesdeUltimoContacto, emailsSinRespuesta, riesgoNoShowDeSocio,
  pagosEnRiesgo, agruparFranjasRecurrentes, demandaInsatisfecha, intentosFallidosRecientes,
  variacionOcupacionFranja, claveFranjaDe, franjaLocalDe, type FranjaRecurrente,
} from './senales.ts';

const NOW = new Date('2026-07-11T12:00:00.000Z');
const diasAntes = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

let n = 0;
function socio(p: Partial<Socio> & Pick<Socio, 'id'>): Socio {
  return { studioId: 'e1', nombre: 'Ana', apellidos: 'B', email: 'a@b.c', telefono: null, nif: null, fechaAlta: '2025-01-01', activo: true, ...p };
}
function reserva(p: Partial<Reserva> & Pick<Reserva, 'socioId' | 'estado'>): Reserva {
  return { id: `res-${++n}`, studioId: 'e1', sesionId: 'ses-1', spotId: null, posicionEspera: null, ofertaExpiraEn: null, checkInEn: null, creadoEn: diasAntes(1), ...p };
}
function suscripcion(p: Partial<Suscripcion> & Pick<Suscripcion, 'socioId' | 'planId'>): Suscripcion {
  return { id: `sus-${++n}`, studioId: 'e1', estado: 'ACTIVA', fechaInicio: '2025-01-01', fechaFin: null, sesionesRestantes: null, stripeSubscriptionId: null, ...p };
}
function plan(p: Partial<PlanTarifa> & Pick<PlanTarifa, 'id'>): PlanTarifa {
  return { studioId: 'e1', nombre: 'Plan', descripcion: null, precio: 89, tipo: 'MENSUAL', sesiones: null, validezDias: null, limiteSemanal: null, activo: true, ...p };
}
function recibo(p: Partial<Recibo> & Pick<Recibo, 'estado'>): Recibo {
  return { id: `rec-${++n}`, studioId: 'e1', socioId: null, suscripcionId: null, concepto: 'Cuota', importe: 50, fechaVencimiento: diasAntes(5), fechaCobro: null, fechaDevolucion: null, intentosReintento: 0, ...p };
}
function sesion(p: Partial<Sesion> & Pick<Sesion, 'id' | 'inicio'>): Sesion {
  return { studioId: 'e1', tipoClaseId: 'tc1', salaId: 's1', instructorId: 'i1', fin: p.inicio, aforoMaximo: 8, cancelada: false, notas: null, precioPuntual: null, ...p };
}
function log(p: Partial<AutomationLog> & Pick<AutomationLog, 'socioId' | 'resultado' | 'accion'>): AutomationLog {
  return { id: `log-${++n}`, studioId: 'e1', ruleId: 'r1', automatizacionId: null, ruleName: 'R', socioNombre: null, pasoIndex: 0, detalle: '', ejecutadoEn: diasAntes(1), proximaAccionEn: null, ...p };
}
function snapshot(over: Partial<SnapshotEstudio>): SnapshotEstudio {
  return {
    studioId: 'e1', socios: [], reservas: [], sesiones: [], salas: [], recibos: [],
    suscripciones: [], planesTarifa: [], tiposClase: [], instructores: [], automationLogs: [], campanas: [], sustituciones: [], instructorTarifas: [], intentosFallidos: [], contexto: { nSociasActivas: 0, antiguedadDatosDias: 999, cadenaId: null, nSedesCadena: 1 },
    ...over,
  };
}

// ── frecuenciaHabitualPorTipoClase (Finanzas F2) ────────────────────────────

test('frecuenciaHabitualPorTipoClase: solo cuenta asistencias de la disciplina pedida, no las de otra', () => {
  const sesReformer = [0, 7, 14, 21].map(d => sesion({ id: `sr${d}`, inicio: diasAntes(d), tipoClaseId: 'reformer' }));
  const sesMat = [0, 3, 6, 9, 12].map(d => sesion({ id: `sm${d}`, inicio: diasAntes(d), tipoClaseId: 'mat' }));
  const reservas = [
    ...sesReformer.map(se => reserva({ socioId: 'a', estado: 'ASISTIDA', sesionId: se.id, creadoEn: se.inicio })),
    ...sesMat.map(se => reserva({ socioId: 'a', estado: 'ASISTIDA', sesionId: se.id, creadoEn: se.inicio })),
  ];
  const idx = construirIndices(snapshot({ reservas, sesiones: [...sesReformer, ...sesMat] }));
  assert.equal(frecuenciaHabitualPorTipoClase('a', 'reformer', idx), 4 / 8);
  assert.equal(frecuenciaHabitualPorTipoClase('a', 'mat', idx), 5 / 8);
  // Sin acotar (null) cuenta las 9 asistencias de ambas disciplinas — igual que frecuenciaHabitual.
  assert.equal(frecuenciaHabitualPorTipoClase('a', null, idx), frecuenciaHabitual('a', idx));
});

// ── frecuenciaHabitual / diasSinVenir / umbralAnomalo / ausenciaAnomala ──────

test('frecuenciaHabitual: 4+ asistencias en 8 semanas previas a la última → media válida', () => {
  const reservas = [0, 7, 14, 21].map(d => reserva({ socioId: 'a', estado: 'ASISTIDA', creadoEn: diasAntes(d) }));
  const idx = construirIndices(snapshot({ reservas }));
  const freq = frecuenciaHabitual('a', idx);
  assert.ok(freq !== null);
  assert.equal(freq, 4 / 8);
});

test('frecuenciaHabitual: menos de 4 asistencias en ventana → null (historial insuficiente)', () => {
  const reservas = [0, 7].map(d => reserva({ socioId: 'a', estado: 'ASISTIDA', creadoEn: diasAntes(d) }));
  const idx = construirIndices(snapshot({ reservas }));
  assert.equal(frecuenciaHabitual('a', idx), null);
});

test('diasSinVenir: null si nunca ha asistido', () => {
  const idx = construirIndices(snapshot({ reservas: [] }));
  assert.equal(diasSinVenir('a', idx, NOW), null);
});

test('umbralAnomalo: socia de ~3x/semana → 14 días (formula del mockup)', () => {
  // 24 asistencias en 8 semanas = 3/semana.
  const reservas = Array.from({ length: 24 }, (_, i) => reserva({ socioId: 'a', estado: 'ASISTIDA', creadoEn: diasAntes(i * 2) }));
  const idx = construirIndices(snapshot({ reservas }));
  assert.equal(Math.round(umbralAnomalo('a', idx)), 14);
});

test('umbralAnomalo: socia de 1x/semana → 21 días', () => {
  const reservas = Array.from({ length: 8 }, (_, i) => reserva({ socioId: 'a', estado: 'ASISTIDA', creadoEn: diasAntes(i * 7) }));
  const idx = construirIndices(snapshot({ reservas }));
  assert.equal(Math.round(umbralAnomalo('a', idx)), 21);
});

test('umbralAnomalo: sin frecuencia válida → 21 (conservador)', () => {
  const idx = construirIndices(snapshot({ reservas: [] }));
  assert.equal(umbralAnomalo('a', idx), 21);
});

test('ausenciaAnomala: por debajo del umbral → false', () => {
  const reservas = Array.from({ length: 24 }, (_, i) => reserva({ socioId: 'a', estado: 'ASISTIDA', creadoEn: diasAntes(i * 2 + 10) }));
  const idx = construirIndices(snapshot({ reservas }));
  // última asistencia hace 10 días, umbral ~14 → no anómala
  assert.equal(ausenciaAnomala('a', idx, NOW), false);
});

test('ausenciaAnomala: por encima del umbral → true', () => {
  const reservas = Array.from({ length: 24 }, (_, i) => reserva({ socioId: 'a', estado: 'ASISTIDA', creadoEn: diasAntes(i * 2 + 18) }));
  const idx = construirIndices(snapshot({ reservas }));
  // última asistencia hace 18 días, umbral ~14 → anómala
  assert.equal(ausenciaAnomala('a', idx, NOW), true);
});

// ── renovacionProxima ─────────────────────────────────────────────────────────

test('renovacionProxima: días hasta fechaFin de la suscripción ACTIVA', () => {
  const susc = [suscripcion({ socioId: 'a', planId: 'p1', fechaFin: diasAntes(-9) })]; // en 9 días
  const idx = construirIndices(snapshot({ suscripciones: susc }));
  assert.equal(renovacionProxima('a', idx, NOW), 9);
});

test('renovacionProxima: sin suscripción activa → null', () => {
  const idx = construirIndices(snapshot({ suscripciones: [] }));
  assert.equal(renovacionProxima('a', idx, NOW), null);
});

// ── valorMensual ──────────────────────────────────────────────────────────────

test('valorMensual: plan MENSUAL → precio directo', () => {
  const susc = [suscripcion({ socioId: 'a', planId: 'p1' })];
  const planes = [plan({ id: 'p1', precio: 89, tipo: 'MENSUAL' })];
  const idx = construirIndices(snapshot({ suscripciones: susc, planesTarifa: planes }));
  assert.equal(valorMensual('a', idx, NOW), 89);
});

test('valorMensual: BONO con frecuencia válida → precio/sesiones × frecuencia × 4.33', () => {
  const reservas = Array.from({ length: 8 }, (_, i) => reserva({ socioId: 'a', estado: 'ASISTIDA', creadoEn: diasAntes(i * 7) })); // 1/semana
  const susc = [suscripcion({ socioId: 'a', planId: 'p1' })];
  const planes = [plan({ id: 'p1', precio: 100, tipo: 'BONO', sesiones: 10 })];
  const idx = construirIndices(snapshot({ reservas, suscripciones: susc, planesTarifa: planes }));
  const esperado = (100 / 10) * 1 * 4.33;
  assert.ok(Math.abs(valorMensual('a', idx, NOW) - esperado) < 0.01);
});

test('valorMensual: sin suscripción → fallback a media de recibos COBRADOS últimos 90d / 3', () => {
  const recibos = [
    recibo({ estado: 'COBRADO', socioId: 'a', importe: 60, fechaCobro: diasAntes(10) }),
    recibo({ estado: 'COBRADO', socioId: 'a', importe: 60, fechaCobro: diasAntes(40) }),
  ];
  const idx = construirIndices(snapshot({ recibos }));
  assert.equal(valorMensual('a', idx, NOW), 120 / 3);
});

test('valorMensual: sin ningún dato → 0', () => {
  const idx = construirIndices(snapshot({}));
  assert.equal(valorMensual('a', idx, NOW), 0);
});

// ── contacto / emails sin respuesta / no-show ────────────────────────────────

test('diasDesdeUltimoContacto: toma el log más reciente', () => {
  const logs = [
    log({ socioId: 'a', resultado: 'EJECUTADO', accion: 'ENVIAR_EMAIL', ejecutadoEn: diasAntes(20) }),
    log({ socioId: 'a', resultado: 'EJECUTADO', accion: 'ENVIAR_EMAIL', ejecutadoEn: diasAntes(5) }),
  ];
  const idx = construirIndices(snapshot({ automationLogs: logs }));
  assert.equal(diasDesdeUltimoContacto('a', idx, NOW), 5);
});

test('emailsSinRespuesta: email sin reserva en los 7 días siguientes cuenta; con reserva no cuenta', () => {
  const logSinRespuesta = log({ socioId: 'a', resultado: 'EJECUTADO', accion: 'ENVIAR_EMAIL', ejecutadoEn: diasAntes(30) });
  const logConRespuesta = log({ socioId: 'a', resultado: 'EJECUTADO', accion: 'ENVIAR_EMAIL', ejecutadoEn: diasAntes(15) });
  const reservaPosterior = reserva({ socioId: 'a', estado: 'CONFIRMADA', creadoEn: diasAntes(13) }); // 2 días después del log de 15d
  const idx = construirIndices(snapshot({ automationLogs: [logSinRespuesta, logConRespuesta], reservas: [reservaPosterior] }));
  assert.equal(emailsSinRespuesta('a', idx, NOW), 1);
});

test('riesgoNoShowDeSocio: usa la fecha de la CLASE (sesión), no la de creación de la reserva', () => {
  // creadoEn muy reciente a propósito (si el signal mirara esto, el peso saldría
  // distinto): lo que cuenta es sesion.inicio.
  const sesiones = [
    sesion({ id: 'ses-a', inicio: diasAntes(5) }),
    sesion({ id: 'ses-b', inicio: diasAntes(10) }),
    sesion({ id: 'ses-c', inicio: diasAntes(15) }),
  ];
  const reservas = [
    reserva({ socioId: 'a', estado: 'NO_ASISTIO', sesionId: 'ses-a', creadoEn: diasAntes(60) }),
    reserva({ socioId: 'a', estado: 'NO_ASISTIO', sesionId: 'ses-b', creadoEn: diasAntes(60) }),
    reserva({ socioId: 'a', estado: 'ASISTIDA', sesionId: 'ses-c', creadoEn: diasAntes(60) }),
  ];
  const idx = construirIndices(snapshot({ sesiones, reservas }));
  const r = riesgoNoShowDeSocio('a', idx, NOW);
  assert.equal(r.noShows, 2);
  assert.equal(r.resueltas, 3);
});

test('riesgoNoShowDeSocio: una reserva sin sesión en el snapshot se omite (no inventa la fecha)', () => {
  const reservas = [reserva({ socioId: 'a', estado: 'NO_ASISTIO', sesionId: 'ses-fantasma' })];
  const idx = construirIndices(snapshot({ reservas }));
  const r = riesgoNoShowDeSocio('a', idx, NOW);
  assert.equal(r.resueltas, 0);
  assert.equal(r.nivel, 'SIN_DATOS');
});

test('riesgoNoShowDeSocio: CANCELADA no cuenta como resuelta (a diferencia del antiguo noShow30d)', () => {
  // 3 resueltas de verdad (para superar el mínimo de datos) + 1 CANCELADA que
  // el antiguo noShow30d SÍ contaba en el denominador y este signal no debe.
  const sesiones = [
    sesion({ id: 'ses-a', inicio: diasAntes(5) }),
    sesion({ id: 'ses-b', inicio: diasAntes(10) }),
    sesion({ id: 'ses-c', inicio: diasAntes(15) }),
    sesion({ id: 'ses-d', inicio: diasAntes(20) }),
  ];
  const reservas = [
    reserva({ socioId: 'a', estado: 'NO_ASISTIO', sesionId: 'ses-a' }),
    reserva({ socioId: 'a', estado: 'NO_ASISTIO', sesionId: 'ses-b' }),
    reserva({ socioId: 'a', estado: 'ASISTIDA', sesionId: 'ses-c' }),
    reserva({ socioId: 'a', estado: 'CANCELADA', sesionId: 'ses-d' }),
  ];
  const idx = construirIndices(snapshot({ sesiones, reservas }));
  const r = riesgoNoShowDeSocio('a', idx, NOW);
  assert.equal(r.resueltas, 3); // no 4: la cancelada queda fuera
});

// ── pagosEnRiesgo ─────────────────────────────────────────────────────────────

test('pagosEnRiesgo: particiona por tarjeta guardada', () => {
  const socios = [
    socio({ id: 'conTarjeta', stripeCustomerId: 'cus_1', stripePaymentMethodId: 'pm_1' }),
    socio({ id: 'sinTarjeta' }),
  ];
  const recibos = [
    recibo({ estado: 'PENDIENTE', socioId: 'conTarjeta', fechaVencimiento: diasAntes(5) }),
    recibo({ estado: 'PENDIENTE', socioId: 'sinTarjeta', fechaVencimiento: diasAntes(5) }),
  ];
  const idx = construirIndices(snapshot({ socios, recibos }));
  const { conTarjeta, sinTarjeta } = pagosEnRiesgo(idx, NOW);
  assert.equal(conTarjeta.length, 1);
  assert.equal(sinTarjeta.length, 1);
});

test('pagosEnRiesgo: fuera de la ventana de días no cuenta', () => {
  const socios = [socio({ id: 'a', stripeCustomerId: 'cus', stripePaymentMethodId: 'pm' })];
  const recibos = [recibo({ estado: 'PENDIENTE', socioId: 'a', fechaVencimiento: diasAntes(45) })];
  const idx = construirIndices(snapshot({ socios, recibos }));
  const { conTarjeta, sinTarjeta } = pagosEnRiesgo(idx, NOW, 30);
  assert.equal(conTarjeta.length, 0);
  assert.equal(sinTarjeta.length, 0);
});

// ── agruparFranjasRecurrentes / demandaInsatisfecha ─────────────────────────

function slot(diasAtras: number): Sesion {
  const d = new Date(NOW.getTime() - diasAtras * 86400000);
  d.setUTCHours(19, 0, 0, 0);
  return sesion({ id: `ses-${diasAtras}`, inicio: d.toISOString(), aforoMaximo: 8 });
}

test('agruparFranjasRecurrentes: agrupa por dia/hora/tipo y calcula ocupacion', () => {
  const sesiones = [slot(7), slot(14), slot(21)];
  const reservas = sesiones.flatMap(se => Array.from({ length: 8 }, (_, i) => reserva({ socioId: `s${se.id}${i}`, estado: 'CONFIRMADA', sesionId: se.id })));
  const snap = snapshot({ sesiones, reservas });
  const idx = construirIndices(snap);
  const grupos = agruparFranjasRecurrentes(idx, snap, NOW, 3);
  assert.equal(grupos.size, 1);
  const franja = [...grupos.values()][0];
  assert.equal(franja.sesionesOrdenadas.length, 3);
  assert.ok(franja.ocupaciones.every(o => o === 1));
});

// ── Franja en hora local del estudio (regresión del bug UTC) ────────────────

test('franjaLocalDe: devuelve el dia y la hora del estudio, no los de UTC', () => {
  // Martes 7 de julio de 2026, 00:30 en Madrid (CEST) = lunes 22:30 UTC.
  // En UTC esto se contaba como LUNES a las 22:30 — otro día de la semana.
  assert.deepEqual(franjaLocalDe('2026-07-06T22:30:00.000Z'), { dow: 2, hora: 0, minuto: 30 });
  // Clase de las 20:00 de Madrid en verano: 18:00 UTC.
  assert.deepEqual(franjaLocalDe('2026-07-07T18:00:00.000Z'), { dow: 2, hora: 20, minuto: 0 });
});

test('claveFranjaDe: la misma clase semanal conserva su franja al cambiar la hora', () => {
  // Martes 20:00 de Madrid a ambos lados del cambio de hora (29 de marzo de
  // 2026): 19:00 UTC en invierno, 18:00 UTC en verano. Con la clave en UTC eran
  // dos franjas distintas, así que la recurrente se partía en dos justo al
  // cruzar marzo/octubre y no volvía a alcanzar las ocurrencias mínimas.
  const invierno = sesion({ id: 'ses-inv', inicio: '2026-03-24T19:00:00.000Z' });
  const verano = sesion({ id: 'ses-ver', inicio: '2026-03-31T18:00:00.000Z' });
  assert.equal(claveFranjaDe(invierno), claveFranjaDe(verano));
  assert.equal(claveFranjaDe(verano), '2-20:00-tc1');
});

test('agruparFranjasRecurrentes: una clase semanal a caballo del cambio de hora es UNA sola franja', () => {
  const now = new Date('2026-04-07T12:00:00.000Z');
  const sesiones = [
    sesion({ id: 'a', inicio: '2026-03-17T19:00:00.000Z' }), // martes 20:00 Madrid (CET)
    sesion({ id: 'b', inicio: '2026-03-24T19:00:00.000Z' }), // martes 20:00 Madrid (CET)
    sesion({ id: 'c', inicio: '2026-03-31T18:00:00.000Z' }), // martes 20:00 Madrid (CEST)
  ];
  const snap = snapshot({ sesiones });
  const grupos = agruparFranjasRecurrentes(construirIndices(snap), snap, now, 3);
  assert.equal(grupos.size, 1);
  assert.equal([...grupos.values()][0].sesionesOrdenadas.length, 3);
});

test('demandaInsatisfecha: media de socias en lista de espera en las ultimas N ocurrencias', () => {
  const sesiones = [slot(7), slot(14)];
  const reservas = [
    reserva({ socioId: 'x1', estado: 'LISTA_ESPERA', sesionId: sesiones[0].id }),
    reserva({ socioId: 'x2', estado: 'LISTA_ESPERA', sesionId: sesiones[0].id }),
    reserva({ socioId: 'x3', estado: 'LISTA_ESPERA', sesionId: sesiones[1].id }),
  ];
  const snap = snapshot({ sesiones, reservas });
  const idx = construirIndices(snap);
  const grupos = agruparFranjasRecurrentes(idx, snap, NOW, 2);
  const franja = [...grupos.values()][0];
  assert.equal(demandaInsatisfecha(franja, snap, 2), 1.5);
});

// ── intentosFallidosRecientes ───────────────────────────────────────────────

test('intentosFallidosRecientes: cuenta intentos dentro de la ventana, sin importar el motivo', () => {
  const snap = snapshot({
    intentosFallidos: [
      { id: 'if-1', socioId: 'a', sesionId: null, tipoClaseId: null, motivo: 'SIN_PLAN', creadoEn: diasAntes(2) },
      { id: 'if-2', socioId: 'a', sesionId: null, tipoClaseId: null, motivo: 'AFORO_LLENO_SIN_ESPERA', creadoEn: diasAntes(5) },
      { id: 'if-3', socioId: 'b', sesionId: null, tipoClaseId: null, motivo: 'SIN_PLAN', creadoEn: diasAntes(2) },
    ],
  });
  const idx = construirIndices(snap);
  assert.equal(intentosFallidosRecientes('a', idx, NOW, 14), 2);
  assert.equal(intentosFallidosRecientes('b', idx, NOW, 14), 1);
  assert.equal(intentosFallidosRecientes('c', idx, NOW, 14), 0);
});

test('intentosFallidosRecientes: fuera de la ventana no cuenta', () => {
  const snap = snapshot({
    intentosFallidos: [
      { id: 'if-1', socioId: 'a', sesionId: null, tipoClaseId: null, motivo: 'SIN_PLAN', creadoEn: diasAntes(20) },
    ],
  });
  const idx = construirIndices(snap);
  assert.equal(intentosFallidosRecientes('a', idx, NOW, 14), 0);
});

// ── variacionOcupacionFranja ────────────────────────────────────────────────

function franjaConOcupaciones(ocupaciones: number[]): FranjaRecurrente {
  return { clave: 'x', sesionesOrdenadas: [], ocupaciones };
}

test('variacionOcupacionFranja: menos de 2n ocurrencias → null (nunca extrapola)', () => {
  assert.equal(variacionOcupacionFranja(franjaConOcupaciones([0.2, 0.2, 0.3, 0.3, 0.5]), 3), null);
});

test('variacionOcupacionFranja: caída real, últimas 3 más bajas que las 3 anteriores', () => {
  // más reciente primero: 0.2,0.2,0.2 (media 0.2) vs 0.5,0.5,0.5 (media 0.5) → cayó 60%
  const v = variacionOcupacionFranja(franjaConOcupaciones([0.2, 0.2, 0.2, 0.5, 0.5, 0.5]), 3);
  assert.ok(v);
  assert.ok(Math.abs(v.mediaReciente - 0.2) < 1e-9);
  assert.ok(Math.abs(v.mediaAnterior - 0.5) < 1e-9);
  assert.ok(Math.abs(v.pctVariacion - -0.6) < 1e-9);
});

test('variacionOcupacionFranja: sin cambio → pctVariacion 0', () => {
  const v = variacionOcupacionFranja(franjaConOcupaciones([0.3, 0.3, 0.3, 0.3, 0.3, 0.3]), 3);
  assert.equal(v?.pctVariacion, 0);
});

test('variacionOcupacionFranja: media anterior 0 → null (división por cero, nada que comparar)', () => {
  assert.equal(variacionOcupacionFranja(franjaConOcupaciones([0.1, 0.1, 0.1, 0, 0, 0]), 3), null);
});
