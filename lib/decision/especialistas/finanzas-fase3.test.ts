import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Socio, Suscripcion, PlanTarifa, Recibo } from '@/lib/types';
import type { SnapshotEstudio, MemoriaEstudio, Candidata } from '../tipos.ts';
import { finanzas } from './finanzas.ts';

// Fase 3 del Brain — las tres reglas de dinero que miran hacia delante:
//   F3 · el bono que CADUCA con sesiones sin usar (el contrario de F1)
//   F4 · la tarjeta que caduca antes del próximo cobro (hecho, no estimación)
//   F5 · el cobro que tiene pinta de fallar (estimación, y se trata como tal)

const NOW = new Date('2026-07-11T12:00:00.000Z');
const MS_DIA = 86400000;
const enDias = (n: number) => new Date(NOW.getTime() + n * MS_DIA).toISOString();

let n = 0;
function socio(p: Partial<Socio> & Pick<Socio, 'id'>): Socio {
  return {
    studioId: 'e1', nombre: `Socia${p.id}`, apellidos: 'B', email: 'a@b.c',
    telefono: null, nif: null, fechaAlta: '2025-01-01', activo: true, ...p,
  };
}
function suscripcion(p: Partial<Suscripcion> & Pick<Suscripcion, 'socioId' | 'planId'>): Suscripcion {
  return { id: `sus-${++n}`, studioId: 'e1', estado: 'ACTIVA', fechaInicio: '2026-01-01', fechaFin: null, sesionesRestantes: null, stripeSubscriptionId: null, ...p };
}
function plan(p: Partial<PlanTarifa> & Pick<PlanTarifa, 'id'>): PlanTarifa {
  return { studioId: 'e1', nombre: 'Plan', descripcion: null, precio: 89, tipo: 'MENSUAL', sesiones: null, activo: true, ...p };
}
function recibo(p: Partial<Recibo> & Pick<Recibo, 'estado' | 'socioId'>): Recibo {
  return { id: `rec-${++n}`, studioId: 'e1', suscripcionId: null, concepto: 'Cuota', importe: 89, fechaVencimiento: enDias(-30), fechaCobro: null, fechaDevolucion: null, intentosReintento: 0, ...p };
}
function snapshot(over: Partial<SnapshotEstudio>): SnapshotEstudio {
  return {
    studioId: 'e1', socios: [], reservas: [], sesiones: [], salas: [], recibos: [],
    suscripciones: [], planesTarifa: [], tiposClase: [], instructores: [], automationLogs: [],
    campanas: [], sustituciones: [], instructorTarifas: [], intentosFallidos: [], bloqueosAgenda: [],
    contexto: { nSociasActivas: 0, antiguedadDatosDias: 999, cadenaId: null, nSedesCadena: 1 },
    ...over,
  };
}
const memoriaVacia = (): MemoriaEstudio => new Map();
const de = (s: SnapshotEstudio, dedupe: string): Candidata | undefined =>
  finanzas.detectar(s, memoriaVacia(), NOW).find(c => c.dedupeKey.includes(dedupe));

// ── F3 · bono que caduca con sesiones sin usar ──────────────────────────────

const BONO = plan({ id: 'bono10', nombre: 'Bono 10', tipo: 'BONO', sesiones: 10, precio: 175 });

function conBono(sesionesRestantes: number | null, fechaFin: string | null) {
  return snapshot({
    socios: [socio({ id: 'ana', nombre: 'Ana' })],
    planesTarifa: [BONO],
    suscripciones: [suscripcion({ socioId: 'ana', planId: 'bono10', sesionesRestantes, fechaFin })],
  });
}

test('F3: le quedan 5 sesiones y el bono caduca en 3 días → avisa', () => {
  const c = de(conBono(5, enDias(3)), 'PROPONER_RENOVACION_BONO');
  assert.ok(c);
  assert.equal(c.datosUsados.sesionesRestantes, 5);
  assert.equal(c.datosUsados.diasParaCaducar, 3);
  assert.match(c.motivoMotor, /se le van a quedar sin usar/);
  assert.equal(c.confianza.nivel, 'ALTA');
});

test('F3: un bono que caduca dentro de mucho todavía no es noticia', () => {
  assert.equal(de(conBono(5, enDias(60)), 'PROPONER_RENOVACION_BONO'), undefined);
});

test('F3: un bono YA caducado no se avisa — no hay nada que salvar', () => {
  assert.equal(de(conBono(5, enDias(-2)), 'PROPONER_RENOVACION_BONO'), undefined);
});

test('F3: con 1 sesión manda F1 (bono agotado), que es lo urgente de verdad', () => {
  const c = de(conBono(1, enDias(3)), 'PROPONER_RENOVACION_BONO');
  assert.ok(c);
  assert.match(c.tituloMotor, /se le acaba el bono/);
});

test('F3: sin fecha de caducidad no se inventa ninguna', () => {
  assert.equal(de(conBono(5, null), 'PROPONER_RENOVACION_BONO'), undefined);
});

// Caso REAL de producción (2026-08-11) que motivó atar la ventana al ritmo de
// cada socia: con la ventana fija de 14 días, los dos únicos bonos que caducan
// con sesiones sin usar quedaban fuera y no se avisaban a tiempo ninguno.
test('F3: 8 sesiones a 35 días viniendo 1×/semana → se avisa (no le da tiempo)', () => {
  const asistencias = Array.from({ length: 8 }, (_, i) => ({
    ses: { id: `h${i}`, studioId: 'e1', tipoClaseId: 'tc1', salaId: 's1', instructorId: 'i1',
           inicio: enDias(-7 * (i + 1)), fin: enDias(-7 * (i + 1)), aforoMaximo: 8,
           cancelada: false, notas: null, precioPuntual: null },
    res: { id: `r${i}`, studioId: 'e1', socioId: 'ana', sesionId: `h${i}`, estado: 'ASISTIDA' as const,
           spotId: null, posicionEspera: null, ofertaExpiraEn: null, checkInEn: null, creadoEn: enDias(-7 * (i + 1)) },
  }));
  const s = snapshot({
    socios: [socio({ id: 'ana', nombre: 'Ana' })],
    planesTarifa: [BONO],
    suscripciones: [suscripcion({ socioId: 'ana', planId: 'bono10', sesionesRestantes: 8, fechaFin: enDias(35) })],
    sesiones: asistencias.map(a => a.ses),
    reservas: asistencias.map(a => a.res),
  });
  const c = de(s, 'PROPONER_RENOVACION_BONO');
  assert.ok(c, 'a 1 clase/semana necesita 56 días y solo le quedan 35');
  assert.equal(c.datosUsados.sesionesRestantes, 8);
  assert.ok(Number(c.datosUsados.diasQueNecesitaria) > 35);
});

test('F3: si a su ritmo LE DA TIEMPO de sobra, no se la molesta', () => {
  // Viene 4 veces por semana: 2 sesiones las gasta en 4 días.
  const asistencias = Array.from({ length: 32 }, (_, i) => ({
    ses: { id: `h${i}`, studioId: 'e1', tipoClaseId: 'tc1', salaId: 's1', instructorId: 'i1',
           inicio: enDias(-Math.floor(i * 1.75) - 1), fin: enDias(-Math.floor(i * 1.75) - 1), aforoMaximo: 8,
           cancelada: false, notas: null, precioPuntual: null },
    res: { id: `r${i}`, studioId: 'e1', socioId: 'ana', sesionId: `h${i}`, estado: 'ASISTIDA' as const,
           spotId: null, posicionEspera: null, ofertaExpiraEn: null, checkInEn: null, creadoEn: enDias(-Math.floor(i * 1.75) - 1) },
  }));
  const s = snapshot({
    socios: [socio({ id: 'ana', nombre: 'Ana' })],
    planesTarifa: [BONO],
    suscripciones: [suscripcion({ socioId: 'ana', planId: 'bono10', sesionesRestantes: 2, fechaFin: enDias(13) })],
    sesiones: asistencias.map(a => a.ses),
    reservas: asistencias.map(a => a.res),
  });
  const c = de(s, 'PROPONER_RENOVACION_BONO');
  // Sigue dentro del suelo de 14 días, así que se avisa — pero SIN la confianza
  // alta: a su ritmo le sobra tiempo.
  assert.ok(c);
  assert.equal(c.confianza.nivel, 'MEDIA');
});

// ── F4 · la tarjeta caduca antes del próximo cobro ──────────────────────────

const MENSUAL = plan({ id: 'mes', nombre: 'Ilimitado', tipo: 'MENSUAL', precio: 89 });

function conTarjeta(p: Partial<Socio>, fechaFin: string | null = enDias(20)) {
  return snapshot({
    socios: [socio({ id: 'ana', nombre: 'Ana', stripePaymentMethodId: 'pm_1', ...p })],
    planesTarifa: [MENSUAL],
    suscripciones: [suscripcion({ socioId: 'ana', planId: 'mes', fechaFin })],
  });
}

test('F4: la tarjeta caduca antes del cobro → avisa, y con marca y últimos 4', () => {
  // Caduca 07/2026: deja de valer el 1 de agosto, antes del cobro (31 de julio... no).
  const c = de(conTarjeta({ tarjetaExpMes: 7, tarjetaExpAnio: 2026, tarjetaMarca: 'visa', tarjetaUltimos4: '4242' }, enDias(25)), 'TARJETA_CADUCA');
  assert.ok(c);
  assert.equal(c.confianza.nivel, 'ALTA');
  assert.match(c.motivoMotor, /visa ···4242/);
  assert.equal(c.datosUsados.caducidad, '07/2026');
});

test('F4: una tarjeta que aún vale al cobrar no genera nada', () => {
  assert.equal(de(conTarjeta({ tarjetaExpMes: 12, tarjetaExpAnio: 2030 }, enDias(20)), 'TARJETA_CADUCA'), undefined);
});

test('F4: sin caducidad conocida NO se afirma nada (null no es "caduca")', () => {
  assert.equal(de(conTarjeta({ tarjetaExpMes: null, tarjetaExpAnio: null }), 'TARJETA_CADUCA'), undefined);
});

test('F4: sin tarjeta guardada no aplica — a quien paga en mostrador le da igual', () => {
  const s = conTarjeta({ stripePaymentMethodId: null, tarjetaExpMes: 1, tarjetaExpAnio: 2020 });
  assert.equal(de(s, 'TARJETA_CADUCA'), undefined);
});

test('F4: ya caducada urge más y lo dice distinto', () => {
  const c = de(conTarjeta({ tarjetaExpMes: 1, tarjetaExpAnio: 2026, tarjetaMarca: 'visa', tarjetaUltimos4: '4242' }), 'TARJETA_CADUCA');
  assert.ok(c);
  assert.equal(c.datosUsados.yaCaducada, true);
  assert.match(c.tituloMotor, /tiene la tarjeta caducada/);
  assert.ok(c.urgencia > 0.8);
});

test('F4: sin marca ni últimos 4 dice "su tarjeta", no una cadena a medias', () => {
  const c = de(conTarjeta({ tarjetaExpMes: 1, tarjetaExpAnio: 2026 }), 'TARJETA_CADUCA');
  assert.ok(c);
  assert.match(c.motivoMotor, /^su tarjeta caducó/);
});

// ── F5 · el cobro que tiene pinta de fallar ─────────────────────────────────

function conHistorial(recibosAna: Recibo[], recibosResto: Recibo[] = []) {
  return snapshot({
    socios: [socio({ id: 'ana', nombre: 'Ana' })],
    planesTarifa: [MENSUAL],
    suscripciones: [suscripcion({ socioId: 'ana', planId: 'mes', fechaFin: enDias(10) })],
    recibos: [...recibosAna, ...recibosResto],
  });
}

/** El resto del estudio paga sin problema: eso es el prior. */
const RESTO_SANO = Array.from({ length: 20 }, () => recibo({ socioId: 'otra', estado: 'COBRADO' }));

test('F5: a quien le han fallado casi todos los cobros, se avisa antes del siguiente', () => {
  const suyos = [
    ...Array.from({ length: 6 }, () => recibo({ socioId: 'ana', estado: 'FALLIDO' })),
    recibo({ socioId: 'ana', estado: 'COBRADO' }),
  ];
  const c = de(conHistorial(suyos, RESTO_SANO), 'RIESGO_COBRO');
  assert.ok(c);
  assert.equal(c.datosUsados.cobrosResueltos, 7);
  assert.equal(c.datosUsados.cobrosEntrados, 1);
  // Es una estimación: nunca ALTA.
  assert.notEqual(c.confianza.nivel, 'ALTA');
  assert.ok(c.prediccion);
  assert.match(c.motivoMotor, /le han entrado 1 de sus 7 cobros/);
});

test('F5: con poco historial NO se acusa a nadie de que va a dejar de pagar', () => {
  const suyos = [recibo({ socioId: 'ana', estado: 'FALLIDO' }), recibo({ socioId: 'ana', estado: 'FALLIDO' })];
  assert.equal(de(conHistorial(suyos, RESTO_SANO), 'RIESGO_COBRO'), undefined);
});

test('F5: quien siempre ha pagado no genera ningún aviso', () => {
  const suyos = Array.from({ length: 8 }, () => recibo({ socioId: 'ana', estado: 'COBRADO' }));
  assert.equal(de(conHistorial(suyos, RESTO_SANO), 'RIESGO_COBRO'), undefined);
});

test('F5: una DEVOLUCIÓN cuenta como no cobrado — el dinero no se quedó', () => {
  const suyos = [
    ...Array.from({ length: 6 }, () => recibo({ socioId: 'ana', estado: 'DEVUELTO' })),
    recibo({ socioId: 'ana', estado: 'COBRADO' }),
  ];
  const c = de(conHistorial(suyos, RESTO_SANO), 'RIESGO_COBRO');
  assert.ok(c);
  assert.equal(c.datosUsados.cobrosEntrados, 1);
});

test('F5: los PENDIENTE no cuentan: aún no son ni un sí ni un no', () => {
  const suyos = [
    ...Array.from({ length: 6 }, () => recibo({ socioId: 'ana', estado: 'PENDIENTE' })),
    recibo({ socioId: 'ana', estado: 'COBRADO' }),
  ];
  // Solo 1 resuelto → por debajo del mínimo de muestra → sin aviso.
  assert.equal(de(conHistorial(suyos, RESTO_SANO), 'RIESGO_COBRO'), undefined);
});

test('F5: nunca propone cobrar — solo hablar con ella', () => {
  const suyos = [
    ...Array.from({ length: 6 }, () => recibo({ socioId: 'ana', estado: 'FALLIDO' })),
    recibo({ socioId: 'ana', estado: 'COBRADO' }),
  ];
  const c = de(conHistorial(suyos, RESTO_SANO), 'RIESGO_COBRO');
  assert.ok(c);
  assert.notEqual(c.accion.tipo, 'COBRAR_RECIBOS');
  assert.equal(c.accion.tipo, 'CONTACTO_MANUAL');
});

test('F4 gana a F5: si la tarjeta caduca, eso es un hecho y la estimación sobra', () => {
  const suyos = [
    ...Array.from({ length: 6 }, () => recibo({ socioId: 'ana', estado: 'FALLIDO' })),
    recibo({ socioId: 'ana', estado: 'COBRADO' }),
  ];
  const s = snapshot({
    socios: [socio({ id: 'ana', nombre: 'Ana', stripePaymentMethodId: 'pm_1', tarjetaExpMes: 1, tarjetaExpAnio: 2026 })],
    planesTarifa: [MENSUAL],
    suscripciones: [suscripcion({ socioId: 'ana', planId: 'mes', fechaFin: enDias(10) })],
    recibos: [...suyos, ...RESTO_SANO],
  });
  assert.ok(de(s, 'TARJETA_CADUCA'));
  assert.equal(de(s, 'RIESGO_COBRO'), undefined);
});
