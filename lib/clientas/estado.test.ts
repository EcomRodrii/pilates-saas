import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PlanTarifa, Suscripcion } from '../types.ts';
import {
  contarPorEstado, estadoClienta, estadosDeClientas, estadosDeEtapa, hechosDeAsistencia,
  type EntradaEstadoClienta, type EstadoClienta, sinVenir, contarSinVenir, DIAS_SIN_VENIR,
} from './estado.ts';

// «Hoy» fijo, en hora de Madrid (verano, +02:00): miércoles 1-oct-2026 a mediodía.
const AHORA = new Date('2026-10-01T12:00:00+02:00');
const HOY = '2026-10-01';
/** 'YYYY-MM-DD' de hace n días (negativo = en el futuro). */
const hace = (n: number) => {
  const d = new Date(`${HOY}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
/** Una clase de hace n días a las 18:00 de Madrid, como instante. */
const clase = (n: number, hora = '18:00') => `${hace(n)}T${hora}:00+02:00`;

const plan = (p: Partial<PlanTarifa> & Pick<PlanTarifa, 'id' | 'tipo'>): PlanTarifa => ({
  studioId: 's', nombre: p.id, descripcion: null, precio: 50, sesiones: p.tipo === 'MENSUAL' ? null : 10, activo: true, ...p,
}) as PlanTarifa;
const PLANES: PlanTarifa[] = [
  plan({ id: 'mensual', tipo: 'MENSUAL' }),
  plan({ id: 'bono-reformer', tipo: 'BONO' }),
  plan({ id: 'bono-mat', tipo: 'BONO' }),
  plan({ id: 'suelta', tipo: 'PUNTUAL', sesiones: 1 }),
  plan({ id: 'prueba', tipo: 'PUNTUAL', sesiones: 1, esPrueba: true }),
];

let n = 0;
const sus = (s: Partial<Suscripcion> & Pick<Suscripcion, 'planId'>): Suscripcion => ({
  id: `sus-${++n}`, studioId: 's', socioId: 'soc', estado: 'ACTIVA', fechaInicio: hace(20), fechaFin: hace(-20),
  sesionesRestantes: null, stripeSubscriptionId: null, ...s,
});

const entrada = (e: Partial<EntradaEstadoClienta> = {}): EntradaEstadoClienta => ({
  socioId: 'soc', activo: true, fechaAlta: hace(400), historialPrevio: false,
  suscripciones: [], planesTarifa: PLANES, ultimaAsistencia: null, primeraReserva: null, ...e,
});
const estado = (e: Partial<EntradaEstadoClienta> = {}) => estadoClienta(entrada(e), AHORA);

// ── El orden de las reglas ──────────────────────────────────────────────────

test('de baja gana a todo, aunque tenga una cuota vigente', () => {
  assert.equal(estado({ activo: false, suscripciones: [sus({ planId: 'mensual' })] }).estado, 'DE_BAJA');
});

test('una cuota pausada: Pausada', () => {
  assert.equal(estado({ suscripciones: [sus({ planId: 'mensual', estado: 'PAUSADA' })] }).estado, 'PAUSADA');
});

test('pausada pero con otro plan que la deja reservar: Activa (puede venir)', () => {
  const r = estado({ suscripciones: [sus({ planId: 'mensual', estado: 'PAUSADA' }), sus({ planId: 'bono-mat', sesionesRestantes: 4 })] });
  assert.equal(r.estado, 'ACTIVA');
});

// ── La prueba ───────────────────────────────────────────────────────────────

test('clase de prueba reservada para dentro de unos días: De prueba', () => {
  const r = estado({ suscripciones: [sus({ planId: 'prueba', fechaInicio: hace(2), sesionesRestantes: 1 })], primeraReserva: clase(-3) });
  assert.equal(r.estado, 'DE_PRUEBA');
  assert.equal(r.desde, hace(-3));
});

test('vino a la prueba hace 30 días: sigue De prueba; hace 31, Inactiva (ni Sin renovar ni Interesada)', () => {
  const prueba = sus({ planId: 'prueba', fechaInicio: hace(40), sesionesRestantes: 0 });
  // Su clase de prueba es también su asistencia: venir a la prueba no la hace «activa».
  assert.equal(estado({ suscripciones: [prueba], primeraReserva: clase(30), ultimaAsistencia: clase(30) }).estado, 'DE_PRUEBA');
  assert.equal(estado({ suscripciones: [prueba], primeraReserva: clase(31), ultimaAsistencia: clase(31) }).estado, 'INACTIVA');
});

test('solo la prueba, pero vuelve a una clase hace 10 días (pasados los 30 de la prueba): Activa, no nueva', () => {
  const r = estado({ suscripciones: [sus({ planId: 'prueba', fechaInicio: hace(60), sesionesRestantes: 0 })], primeraReserva: clase(50), ultimaAsistencia: clase(10) });
  assert.equal(r.estado, 'ACTIVA');
  assert.equal(r.nueva, false);
});

test('prueba y después una compra de verdad: Activa y nueva', () => {
  const r = estado({ suscripciones: [sus({ planId: 'prueba', fechaInicio: hace(15) }), sus({ planId: 'bono-reformer', fechaInicio: hace(10), sesionesRestantes: 9 })] });
  assert.equal(r.estado, 'ACTIVA');
  assert.equal(r.nueva, true);
  assert.equal(r.primeraCompraReal, hace(10));
});

test('una veterana a la que se le regala una prueba: la fecha de la prueba es cuando se le dio', () => {
  const r = estado({ suscripciones: [sus({ planId: 'prueba', fechaInicio: hace(5), sesionesRestantes: 1 })], primeraReserva: clase(300) });
  assert.equal(r.estado, 'DE_PRUEBA');
  assert.equal(r.desde, hace(5));
});

// ── Cuotas y bonos ──────────────────────────────────────────────────────────

test('cuota mensual vigente: Activa; con la fecha de fin vacía (filas antiguas), también', () => {
  assert.equal(estado({ suscripciones: [sus({ planId: 'mensual' })] }).estado, 'ACTIVA');
  assert.equal(estado({ suscripciones: [sus({ planId: 'mensual', fechaFin: null })] }).estado, 'ACTIVA');
});

test('cuota con baja al vencer, aún dentro de su periodo: Activa', () => {
  assert.equal(estado({ suscripciones: [sus({ planId: 'mensual', bajaAlVencer: true })] }).estado, 'ACTIVA');
});

test('una cuota CANCELADA con fin futuro no la deja reservar: no es Activa', () => {
  const r = estado({ suscripciones: [sus({ planId: 'mensual', estado: 'CANCELADA', fechaInicio: hace(20) })] });
  assert.notEqual(r.estado, 'ACTIVA');
  assert.equal(r.derecho, false);
});

test('dos disciplinas: bono de Reformer agotado + cuota de Mat vigente → Activa, y al revés', () => {
  assert.equal(estado({ suscripciones: [sus({ planId: 'bono-reformer', sesionesRestantes: 0 }), sus({ planId: 'mensual' })] }).estado, 'ACTIVA');
  assert.equal(estado({ suscripciones: [sus({ planId: 'mensual', fechaFin: hace(10) }), sus({ planId: 'bono-mat', sesionesRestantes: 3 })] }).estado, 'ACTIVA');
});

test('bono con sesiones pero caducado ayer: Sin renovar desde ayer', () => {
  const r = estado({ suscripciones: [sus({ planId: 'bono-reformer', fechaInicio: hace(90), fechaFin: hace(1), sesionesRestantes: 3 })], ultimaAsistencia: clase(40) });
  assert.equal(r.estado, 'SIN_RENOVAR');
  assert.equal(r.desde, hace(1));
});

test('bono agotado que caduca dentro de mucho y última clase hace 90 días: Inactiva (un fin futuro no es actividad)', () => {
  const r = estado({ suscripciones: [sus({ planId: 'bono-reformer', fechaInicio: hace(120), fechaFin: hace(-270), sesionesRestantes: 0 })], ultimaAsistencia: clase(90) });
  assert.equal(r.estado, 'INACTIVA');
});

test('renovación sin pagar (venció ayer): vino hace 5 días → Activa; hace 40 → Sin renovar', () => {
  const vencida = sus({ planId: 'mensual', fechaInicio: hace(31), fechaFin: hace(1) });
  assert.equal(estado({ suscripciones: [vencida], ultimaAsistencia: clase(5) }).estado, 'ACTIVA');
  assert.equal(estado({ suscripciones: [vencida], ultimaAsistencia: clase(40) }).estado, 'SIN_RENOVAR');
});

test('EXPIRADA cuenta igual que una activa con la fecha pasada', () => {
  const a = estado({ suscripciones: [sus({ planId: 'mensual', estado: 'EXPIRADA', fechaInicio: hace(80), fechaFin: hace(50) })] });
  const b = estado({ suscripciones: [sus({ planId: 'mensual', fechaInicio: hace(80), fechaFin: hace(50) })] });
  assert.equal(a.estado, b.estado);
  assert.equal(a.estado, 'SIN_RENOVAR');
});

test('cuota comprada ayer y cancelada sin venir: Sin renovar, no Inactiva', () => {
  assert.equal(estado({ suscripciones: [sus({ planId: 'mensual', estado: 'CANCELADA', fechaInicio: hace(1) })] }).estado, 'SIN_RENOVAR');
});

test('un plan borrado del catálogo cuenta como compra pero no da derecho a reservar', () => {
  const r = estado({ suscripciones: [sus({ planId: 'ya-no-existe', fechaInicio: hace(200), fechaFin: hace(170) })] });
  assert.equal(r.derecho, false);
  assert.equal(r.estado, 'INACTIVA');
  assert.equal(r.primeraCompraReal, hace(200));
});

// ── Clases sueltas sin plan ─────────────────────────────────────────────────

test('sin plan vigente: vino hace 10 o 30 días → Activa; 31 → Sin renovar; 61 → Inactiva', () => {
  const suelta = sus({ planId: 'suelta', fechaInicio: hace(200), fechaFin: hace(170), sesionesRestantes: 0 });
  assert.equal(estado({ suscripciones: [suelta], ultimaAsistencia: clase(10) }).estado, 'ACTIVA');
  assert.equal(estado({ suscripciones: [suelta], ultimaAsistencia: clase(30) }).estado, 'ACTIVA');
  assert.equal(estado({ suscripciones: [suelta], ultimaAsistencia: clase(31) }).estado, 'SIN_RENOVAR');
  assert.equal(estado({ suscripciones: [suelta], ultimaAsistencia: clase(61) }).estado, 'INACTIVA');
});

// ── Interesadas e importadas ────────────────────────────────────────────────

test('ficha vacía: Interesada desde su alta', () => {
  const r = estado({ fechaAlta: '2026-09-20T10:00:00+02:00' });
  assert.equal(r.estado, 'INTERESADA');
  assert.equal(r.desde, '2026-09-20');
});

test('con solo una reserva futura y sin plan: Interesada', () => {
  assert.equal(estado({ primeraReserva: clase(-4) }).estado, 'INTERESADA');
});

test('importada con historial y sin datos aquí: Inactiva, no Interesada', () => {
  assert.equal(estado({ historialPrevio: true }).estado, 'INACTIVA');
});

// ── Bordes ──────────────────────────────────────────────────────────────────

test('«nueva» hasta los 30 días de su primera compra', () => {
  assert.equal(estado({ suscripciones: [sus({ planId: 'mensual', fechaInicio: hace(30) })] }).nueva, true);
  assert.equal(estado({ suscripciones: [sus({ planId: 'mensual', fechaInicio: hace(31) })] }).nueva, false);
});

test('una veterana que estrena plan no es «nueva»; venir a su prueba días antes de comprar, sí', () => {
  const plan = sus({ planId: 'mensual', fechaInicio: hace(10) });
  // Venía a clases desde hace meses (otro sistema, o antes de usar planes).
  const veterana = estado({ suscripciones: [plan], primeraReserva: clase(200), ultimaAsistencia: clase(2) });
  assert.equal(veterana.nueva, false);
  assert.equal(veterana.desde, hace(200));
  // Importada con historial.
  assert.equal(estado({ suscripciones: [plan], historialPrevio: true }).nueva, false);
  // Su prueba fue 12 días antes de comprar: nueva.
  assert.equal(estado({ suscripciones: [plan], primeraReserva: clase(22), ultimaAsistencia: clase(2) }).nueva, true);
});

test('los días se cuentan en el calendario de Madrid: una clase a las 23:30 cuenta en su día', () => {
  // Clase el 1-sep a las 23:30 de Madrid (21:30 UTC) y se evalúa el 1-oct a las 00:30 de Madrid:
  // son 30 días de calendario, aunque en UTC el 1-oct todavía sea 30-sep.
  const r = estadoClienta(entrada({ ultimaAsistencia: '2026-09-01T23:30:00+02:00' }), new Date('2026-10-01T00:30:00+02:00'));
  assert.equal(r.estado, 'ACTIVA');
});

test('una asistida en el futuro no cuenta como venida', () => {
  const h = hechosDeAsistencia(
    [{ socioId: 'soc', sesionId: 'futura', estado: 'ASISTIDA' }],
    [{ id: 'futura', inicio: clase(-2) }],
    AHORA,
  );
  assert.equal(h.get('soc')?.ultimaAsistencia, null);
  assert.equal(h.get('soc')?.primeraReserva, clase(-2));
});

test('hechos: la fecha es la de la clase, y las canceladas no cuentan', () => {
  const h = hechosDeAsistencia(
    [
      { socioId: 'soc', sesionId: 'a', estado: 'ASISTIDA' },
      { socioId: 'soc', sesionId: 'b', estado: 'ASISTIDA' },
      { socioId: 'soc', sesionId: 'c', estado: 'CANCELADA' },
      { socioId: 'soc', sesionId: 'd', estado: 'NO_ASISTIO' },
    ],
    [{ id: 'a', inicio: clase(20) }, { id: 'b', inicio: clase(3) }, { id: 'c', inicio: clase(1) }, { id: 'd', inicio: clase(50) }],
    AHORA,
  );
  assert.equal(h.get('soc')?.ultimaAsistencia, clase(3));
  assert.equal(h.get('soc')?.primeraReserva, clase(50));
});

// ── El mismo número en todas partes ─────────────────────────────────────────

const FIXTURE = {
  socios: [
    { id: 'a', activo: true, fechaAlta: hace(300), leadStage: undefined },
    { id: 'b', activo: true, fechaAlta: hace(300), leadStage: undefined },
    { id: 'c', activo: false, fechaAlta: hace(300), leadStage: undefined },
    { id: 'd', activo: true, fechaAlta: hace(3), leadStage: undefined },
    { id: 'e', activo: true, fechaAlta: hace(300), leadStage: 'ACTIVA' as const },
    { id: 'f', activo: true, fechaAlta: hace(60), leadStage: undefined },
  ],
  suscripciones: [
    sus({ socioId: 'a', planId: 'mensual' }),
    sus({ socioId: 'b', planId: 'bono-mat', fechaInicio: hace(100), fechaFin: hace(10), sesionesRestantes: 2 }),
    sus({ socioId: 'c', planId: 'mensual' }),
    sus({ socioId: 'f', planId: 'prueba', fechaInicio: hace(5), sesionesRestantes: 1 }),
  ],
  planesTarifa: PLANES,
  reservas: [{ socioId: 'b', sesionId: 's1', estado: 'ASISTIDA' as const }],
  sesiones: [{ id: 's1', inicio: clase(45) }],
};

test('estadosDeClientas da lo mismo que preguntar clienta a clienta', () => {
  const todas = estadosDeClientas(FIXTURE, AHORA);
  const hechos = hechosDeAsistencia(FIXTURE.reservas, FIXTURE.sesiones, AHORA);
  for (const s of FIXTURE.socios) {
    const una = estadoClienta({
      socioId: s.id, activo: s.activo, fechaAlta: s.fechaAlta, historialPrevio: s.leadStage === 'ACTIVA',
      suscripciones: FIXTURE.suscripciones.filter(x => x.socioId === s.id), planesTarifa: PLANES,
      ultimaAsistencia: hechos.get(s.id)?.ultimaAsistencia ?? null, primeraReserva: hechos.get(s.id)?.primeraReserva ?? null,
    }, AHORA);
    assert.deepEqual(todas.get(s.id), una, s.id);
  }
});

test('el recuento de cada estado es el número de filas que enseña su filtro', () => {
  const todas = estadosDeClientas(FIXTURE, AHORA);
  const conteos = contarPorEstado(todas);
  const esperado: Partial<Record<EstadoClienta, number>> = { ACTIVA: 1, SIN_RENOVAR: 1, DE_BAJA: 1, INTERESADA: 1, INACTIVA: 1, DE_PRUEBA: 1 };
  for (const [e, n] of Object.entries(esperado)) {
    const filas = FIXTURE.socios.filter(s => todas.get(s.id)?.estado === e).length;
    assert.equal(conteos[e as EstadoClienta], filas, e);
    assert.equal(filas, n, e);
  }
  assert.equal(conteos.TOTAL, FIXTURE.socios.length);
  // «Con plan o bono»: a (cuota), c (de baja, pero su cuota sigue vigente) y f (su prueba sin usar).
  assert.equal(conteos.CON_DERECHO, 3);
});

// ── Compatibilidad con la etapa de antes ────────────────────────────────────

test('la etapa antigua se traduce al estado; «En riesgo» se sigue leyendo de la columna', () => {
  assert.deepEqual([...(estadosDeEtapa('LEAD') as Set<EstadoClienta>)], ['INTERESADA']);
  assert.deepEqual([...(estadosDeEtapa('PRUEBA') as Set<EstadoClienta>)], ['DE_PRUEBA']);
  assert.deepEqual([...(estadosDeEtapa('PERDIDA') as Set<EstadoClienta>)].sort(), ['DE_BAJA', 'INACTIVA']);
  assert.deepEqual([...(estadosDeEtapa('SIN_RENOVAR') as Set<EstadoClienta>)], ['SIN_RENOVAR']);
  assert.equal(estadosDeEtapa('EN_RIESGO'), 'COLUMNA_LEGADA');
});

test('«sin venir»: desde su última clase, o desde el alta si nunca vino; las interesadas no cuentan', () => {
  const activa = { estado: 'ACTIVA' as const, desde: null, nueva: false, derecho: true, primeraCompraReal: null };
  const interesada = { ...activa, estado: 'INTERESADA' as const, derecho: false };
  const hace = (dias: number) => new Date(AHORA.getTime() - dias * 86_400_000).toISOString();
  assert.equal(DIAS_SIN_VENIR, 30);
  // Vino hace 31 días: sí. Hace 29: no.
  assert.equal(sinVenir(activa, { ultimaAsistencia: hace(31), primeraReserva: null }, '2026-01-01', AHORA), true);
  assert.equal(sinVenir(activa, { ultimaAsistencia: hace(29), primeraReserva: null }, '2026-01-01', AHORA), false);
  // Nunca ha venido: cuenta desde su alta (paga y no viene).
  assert.equal(sinVenir(activa, undefined, hace(40), AHORA), true);
  assert.equal(sinVenir(activa, undefined, hace(5), AHORA), false);
  // Interesada: ni nunca vino ni es su caso.
  assert.equal(sinVenir(interesada, undefined, hace(400), AHORA), false);

  const estados = new Map([['a', activa], ['b', activa], ['c', interesada]]);
  const hechos = new Map([['a', { ultimaAsistencia: hace(45), primeraReserva: null }], ['b', { ultimaAsistencia: hace(3), primeraReserva: null }]]);
  const socios = [{ id: 'a', fechaAlta: hace(300) }, { id: 'b', fechaAlta: hace(300) }, { id: 'c', fechaAlta: hace(300) }];
  assert.equal(contarSinVenir(socios, estados, hechos, AHORA), 1);
});

test('una ficha sin fecha de alta (o con una que no es fecha) no tumba el cálculo', () => {
  // La columna `socios.fecha_alta` admite nulos: fichas importadas o muy antiguas.
  // Formatear una fecha inválida lanza, y eso tiraba la lista y el Resumen enteros.
  for (const fechaAlta of [null, undefined, '', 'no-es-una-fecha']) {
    const r = estado({ fechaAlta });
    assert.equal(r.estado, 'INTERESADA', String(fechaAlta));
    assert.equal(r.desde, null, String(fechaAlta));
  }
  const ana = { estado: 'ACTIVA' as const, desde: null, nueva: false, derecho: true, primeraCompraReal: null };
  // Sin ninguna fecha, como siempre: cuenta como «sin venir».
  assert.equal(sinVenir(ana, undefined, null, AHORA), true);
  assert.equal(sinVenir(ana, undefined, 'no-es-una-fecha', AHORA), true);
});

