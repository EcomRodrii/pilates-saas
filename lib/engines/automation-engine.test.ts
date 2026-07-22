// Tests del motor de automatizaciones (el diferenciador). Runner nativo de Node.
// Blindan que la optimización P0-19 (índices compartidos + ventana) no cambia
// qué candidatos se detectan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AutomationRule, AutomationLog, Socio, Reserva, Sesion, TipoClase, Recibo, Suscripcion, PlanTarifa } from '@/lib/types';
import { computeAutomationCandidatos, type AutomationEngineInput } from './automation-engine.ts';

const NOW = new Date('2026-07-10T12:00:00.000Z');
const diasAntes = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

let n = 0;
function socio(p: Partial<Socio> & Pick<Socio, 'id'>): Socio {
  return { studioId: 'e1', nombre: 'A', apellidos: 'B', email: 'a@b.c', telefono: null, nif: null, fechaAlta: '2026-01-01', activo: true, ...p };
}
function reserva(p: Partial<Reserva> & Pick<Reserva, 'socioId' | 'sesionId' | 'estado'>): Reserva {
  return { id: `res-${++n}`, studioId: 'e1', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: diasAntes(1), ...p };
}
function sesion(p: Partial<Sesion> & Pick<Sesion, 'id' | 'inicio'>): Sesion {
  return { studioId: 'e1', tipoClaseId: 'tc1', salaId: 's1', instructorId: 'i1', fin: p.inicio, aforoMaximo: 8, cancelada: false, notas: null, precioPuntual: null, ...p };
}
const tipo: TipoClase = { id: 'tc1', studioId: 'e1', nombre: 'Reformer', color: '#000', duracionMinutos: 60, descripcion: '', nivel: 'TODOS', fotoUrl: null };
function rule(p: Partial<AutomationRule> & Pick<AutomationRule, 'trigger'>): AutomationRule {
  return { id: `rule-${p.trigger}`, studioId: 'e1', nombre: 'R', descripcion: '', icono: '', condicion: {}, pasos: [], activa: true, ejecutadaVeces: 0, ultimaEjecucion: null, creadaEn: '2026-01-01', ...p };
}
function log(p: Partial<AutomationLog> & Pick<AutomationLog, 'ruleId' | 'resultado'>): AutomationLog {
  return { id: `log-${++n}`, studioId: 'e1', automatizacionId: null, ruleName: 'R', socioId: null, socioNombre: null, pasoIndex: 0, accion: 'ENVIAR_EMAIL', detalle: '', ejecutadoEn: diasAntes(1), proximaAccionEn: null, ...p };
}
function recibo(p: Partial<Recibo> & Pick<Recibo, 'socioId' | 'estado'>): Recibo {
  return {
    id: `rec-${++n}`, studioId: 'e1', suscripcionId: null, concepto: 'Mensualidad', importe: 50,
    fechaVencimiento: diasAntes(0), fechaCobro: null, fechaDevolucion: null, intentosReintento: 0, ...p,
  };
}
function suscripcion(p: Partial<Suscripcion> & Pick<Suscripcion, 'socioId' | 'planId'>): Suscripcion {
  return {
    id: `sus-${++n}`, studioId: 'e1', estado: 'ACTIVA', fechaInicio: diasAntes(30), fechaFin: null,
    sesionesRestantes: null, stripeSubscriptionId: null, ...p,
  };
}
function planTarifa(p: Partial<PlanTarifa> & Pick<PlanTarifa, 'id' | 'tipo'>): PlanTarifa {
  return { studioId: 'e1', nombre: 'Plan', descripcion: null, precio: 50, sesiones: null, activo: true, ...p };
}
function input(over: Partial<AutomationEngineInput>): AutomationEngineInput {
  return {
    automationRules: [], automationLogs: [], socios: [], reservas: [], recibos: [] as Recibo[], sesiones: [], tiposClase: [tipo],
    suscripciones: [], planesTarifa: [], ...over,
  };
}

// ── AUSENCIA_DIAS ─────────────────────────────────────────────────────────────
test('AUSENCIA_DIAS: socia con última asistencia hace 10d → recordatorio (ENVIAR_EMAIL)', () => {
  const r = rule({ trigger: 'AUSENCIA_DIAS', condicion: { dias: 7, diasCritico: 21 } });
  const s = socio({ id: 'a' });
  const res = reserva({ socioId: 'a', sesionId: 'x', estado: 'ASISTIDA', creadoEn: diasAntes(10) });
  const c = computeAutomationCandidatos(input({ automationRules: [r], socios: [s], reservas: [res] }), NOW);
  assert.equal(c.length, 1);
  assert.equal(c[0].accion, 'ENVIAR_EMAIL');
  assert.equal(c[0].socio?.id, 'a');
  // ENVIAR_EMAIL se manda tal cual: debe llevar mensajeCliente, nunca notaInterna.
  assert.ok(c[0].mensajeCliente, 'ENVIAR_EMAIL debe traer mensajeCliente');
  assert.equal(c[0].notaInterna, undefined);
});

test('AUSENCIA_DIAS: hace 25d (>= crítico) → OFRECER_DESCUENTO', () => {
  const r = rule({ trigger: 'AUSENCIA_DIAS', condicion: { dias: 7, diasCritico: 21, descuentoPct: 15 } });
  const s = socio({ id: 'a' });
  const res = reserva({ socioId: 'a', sesionId: 'x', estado: 'ASISTIDA', creadoEn: diasAntes(25) });
  const c = computeAutomationCandidatos(input({ automationRules: [r], socios: [s], reservas: [res] }), NOW);
  assert.equal(c.length, 1);
  assert.equal(c[0].accion, 'OFRECER_DESCUENTO');
  // OFRECER_DESCUENTO requiere aprobación humana: la nota es SIEMPRE interna
  // (para la propietaria) — nunca debe traer mensajeCliente ya listo, porque
  // ese texto lo redacta aparte lib/inngest/automatizaciones.ts antes de
  // poder enviarse (regresión del bug: la nota interna llegando a la socia).
  assert.ok(c[0].notaInterna, 'OFRECER_DESCUENTO debe traer notaInterna');
  assert.equal(c[0].mensajeCliente, undefined);
});

test('AUSENCIA_DIAS: reciente (3d < umbral), inactiva, y sin asistencias → sin candidatos', () => {
  const r = rule({ trigger: 'AUSENCIA_DIAS', condicion: { dias: 7 } });
  const socios = [
    socio({ id: 'reciente' }),
    socio({ id: 'inactiva', activo: false }),
    socio({ id: 'sinasist' }),
  ];
  const reservas = [
    reserva({ socioId: 'reciente', sesionId: 'x', estado: 'ASISTIDA', creadoEn: diasAntes(3) }),
    reserva({ socioId: 'inactiva', sesionId: 'x', estado: 'ASISTIDA', creadoEn: diasAntes(30) }),
  ];
  const c = computeAutomationCandidatos(input({ automationRules: [r], socios, reservas }), NOW);
  assert.equal(c.length, 0);
});

test('AUSENCIA_DIAS: NO reenvía si ya hay un ENVIAR_EMAIL ejecutado (A-11)', () => {
  const r = rule({ trigger: 'AUSENCIA_DIAS', condicion: { dias: 7 } });
  const s = socio({ id: 'a' });
  const res = reserva({ socioId: 'a', sesionId: 'x', estado: 'ASISTIDA', creadoEn: diasAntes(10) });
  // 'EJECUTADO' es lo que escriben AMBOS caminos de ejecución (antes se
  // deduplicaba por 'ESPERANDO', que nunca se persiste → reenvío diario).
  const l = log({ ruleId: r.id, socioId: 'a', accion: 'ENVIAR_EMAIL', resultado: 'EJECUTADO' });
  const c = computeAutomationCandidatos(input({ automationRules: [r], socios: [s], reservas: [res], automationLogs: [l] }), NOW);
  assert.equal(c.length, 0);
});

test('AUSENCIA_DIAS: SÍ reintenta si el último envío FALLÓ', () => {
  const r = rule({ trigger: 'AUSENCIA_DIAS', condicion: { dias: 7 } });
  const s = socio({ id: 'a' });
  const res = reserva({ socioId: 'a', sesionId: 'x', estado: 'ASISTIDA', creadoEn: diasAntes(10) });
  const l = log({ ruleId: r.id, socioId: 'a', accion: 'ENVIAR_EMAIL', resultado: 'FALLIDO' });
  const c = computeAutomationCandidatos(input({ automationRules: [r], socios: [s], reservas: [res], automationLogs: [l] }), NOW);
  assert.equal(c.length, 1);
  assert.equal(c[0].accion, 'ENVIAR_EMAIL');
});

// ── CLASE_LLENA_RECURRENTE ────────────────────────────────────────────────────
// Franja: mismos día/hora/tipo, 3 semanas seguidas. inicio a la misma hora local.
function slot(diasAtras: number): Sesion {
  // 08:00 UTC en semanas consecutivas (mismo getDay/getHours).
  const d = new Date(NOW.getTime() - diasAtras * 86400000);
  d.setUTCHours(8, 0, 0, 0);
  return sesion({ id: `ses-${diasAtras}`, inicio: d.toISOString(), aforoMaximo: 8 });
}

test('CLASE_LLENA_RECURRENTE: 3 semanas seguidas llenas → NOTIFICAR_ADMIN', () => {
  const r = rule({ trigger: 'CLASE_LLENA_RECURRENTE', condicion: { semanasConsecutivas: 3, ocupacionMinima: 0.95 } });
  const sesiones = [slot(7), slot(14), slot(21)]; // 3 semanas
  // 8/8 en cada una.
  const reservas = sesiones.flatMap(se =>
    Array.from({ length: 8 }, (_, i) => reserva({ socioId: `soc${i}`, sesionId: se.id, estado: 'CONFIRMADA' })));
  const c = computeAutomationCandidatos(input({ automationRules: [r], sesiones, reservas }), NOW);
  assert.equal(c.length, 1);
  assert.equal(c[0].accion, 'NOTIFICAR_ADMIN');
  // Insight sin cliente asociado: nota interna sí, mensajeCliente nunca.
  assert.ok(c[0].notaInterna, 'NOTIFICAR_ADMIN debe traer notaInterna');
  assert.equal(c[0].mensajeCliente, undefined);
});

test('CLASE_LLENA_RECURRENTE: una semana no llena → sin candidato', () => {
  const r = rule({ trigger: 'CLASE_LLENA_RECURRENTE', condicion: { semanasConsecutivas: 3, ocupacionMinima: 0.95 } });
  const sesiones = [slot(7), slot(14), slot(21)];
  const reservas = [
    ...Array.from({ length: 8 }, (_, i) => reserva({ socioId: `a${i}`, sesionId: 'ses-7', estado: 'CONFIRMADA' })),
    ...Array.from({ length: 8 }, (_, i) => reserva({ socioId: `b${i}`, sesionId: 'ses-14', estado: 'CONFIRMADA' })),
    ...Array.from({ length: 4 }, (_, i) => reserva({ socioId: `c${i}`, sesionId: 'ses-21', estado: 'CONFIRMADA' })), // 4/8
  ];
  const c = computeAutomationCandidatos(input({ automationRules: [r], sesiones, reservas }), NOW);
  assert.equal(c.length, 0);
});

test('CLASE_LLENA_RECURRENTE: sesiones fuera de la ventana no cuentan (P0-19)', () => {
  const r = rule({ trigger: 'CLASE_LLENA_RECURRENTE', condicion: { semanasConsecutivas: 3, ocupacionMinima: 0.95 } });
  // 3 llenas pero muy antiguas (fuera de (3+3) semanas = 42 días): 60/67/74 días.
  const sesiones = [slot(60), slot(67), slot(74)];
  const reservas = sesiones.flatMap(se =>
    Array.from({ length: 8 }, (_, i) => reserva({ socioId: `s${se.id}${i}`, sesionId: se.id, estado: 'CONFIRMADA' })));
  const c = computeAutomationCandidatos(input({ automationRules: [r], sesiones, reservas }), NOW);
  assert.equal(c.length, 0);
});

// ── AUSENCIA_DIAS: paso intermedio + dedup por episodio ───────────────────────
test('AUSENCIA_DIAS: 14d (entre umbral y check-in) → check-in, SIN oferta', () => {
  const r = rule({ trigger: 'AUSENCIA_DIAS', condicion: { dias: 7, diasCheckin: 14, diasCritico: 25 } });
  const s = socio({ id: 'a' });
  const res = reserva({ socioId: 'a', sesionId: 'x', estado: 'ASISTIDA', creadoEn: diasAntes(14) });
  const c = computeAutomationCandidatos(input({ automationRules: [r], socios: [s], reservas: [res] }), NOW);
  assert.equal(c.length, 1);
  assert.equal(c[0].accion, 'ENVIAR_EMAIL');
  assert.match(c[0].mensajeCliente ?? '', /todo bien|molestia/i);
});

test('AUSENCIA_DIAS: episodio nuevo tras volver → SÍ vuelve a avisar (no "una vez en la vida")', () => {
  const r = rule({ trigger: 'AUSENCIA_DIAS', condicion: { dias: 7, diasCheckin: 14, diasCritico: 25 } });
  const s = socio({ id: 'a' });
  // Primera racha, ya resuelta: aviso de hace 20 días.
  const logAntiguo = log({ ruleId: r.id, socioId: 'a', accion: 'ENVIAR_EMAIL', resultado: 'EJECUTADO', ejecutadoEn: diasAntes(20) });
  // Volvió a asistir hace 10 días (después del aviso antiguo) — nueva racha empieza ahí.
  const res = reserva({ socioId: 'a', sesionId: 'x', estado: 'ASISTIDA', creadoEn: diasAntes(10) });
  const c = computeAutomationCandidatos(input({ automationRules: [r], socios: [s], reservas: [res], automationLogs: [logAntiguo] }), NOW);
  assert.equal(c.length, 1, 'debe generar un aviso nuevo para la nueva racha, no quedar bloqueado por el log antiguo');
  assert.equal(c[0].accion, 'ENVIAR_EMAIL');
});

// ── PAGO_PENDIENTE_DIAS: escalada ──────────────────────────────────────────────
test('PAGO_PENDIENTE_DIAS: 3d sin tarjeta → primer aviso', () => {
  const r = rule({ trigger: 'PAGO_PENDIENTE_DIAS', condicion: { dias: 3, diasSegundo: 8, diasEscalada: 15 } });
  const s = socio({ id: 'a', stripeCustomerId: null, stripePaymentMethodId: null });
  const rec = recibo({ socioId: 'a', estado: 'PENDIENTE', fechaVencimiento: diasAntes(3) });
  const c = computeAutomationCandidatos(input({ automationRules: [r], socios: [s], recibos: [rec] }), NOW);
  assert.equal(c.length, 1);
  assert.equal(c[0].accion, 'ENVIAR_EMAIL');
  assert.match(c[0].mensajeCliente ?? '', /tienes un pago pendiente/i);
});

test('PAGO_PENDIENTE_DIAS: 8d con el primer aviso ya mandado → segundo aviso, no repite el primero', () => {
  const r = rule({ trigger: 'PAGO_PENDIENTE_DIAS', condicion: { dias: 3, diasSegundo: 8, diasEscalada: 15 } });
  const s = socio({ id: 'a', stripeCustomerId: null, stripePaymentMethodId: null });
  const rec = recibo({ socioId: 'a', estado: 'PENDIENTE', fechaVencimiento: diasAntes(8) });
  const logPrimero = log({
    ruleId: r.id, socioId: 'a', accion: 'ENVIAR_EMAIL', resultado: 'EJECUTADO', reciboId: rec.id,
    detalle: 'Email enviado a a@b.c: "Tienes un pago pendiente"',
  });
  const c = computeAutomationCandidatos(input({ automationRules: [r], socios: [s], recibos: [rec], automationLogs: [logPrimero] }), NOW);
  assert.equal(c.length, 1);
  assert.match(c[0].mensajeCliente ?? '', /segundo aviso|sigue pendiente/i);
});

test('PAGO_PENDIENTE_DIAS: 15d sin tarjeta → escalada a NOTIFICAR_ADMIN, no más emails', () => {
  const r = rule({ trigger: 'PAGO_PENDIENTE_DIAS', condicion: { dias: 3, diasSegundo: 8, diasEscalada: 15 } });
  const s = socio({ id: 'a', stripeCustomerId: null, stripePaymentMethodId: null });
  const rec = recibo({ socioId: 'a', estado: 'PENDIENTE', fechaVencimiento: diasAntes(15) });
  const c = computeAutomationCandidatos(input({ automationRules: [r], socios: [s], recibos: [rec] }), NOW);
  assert.equal(c.length, 1);
  assert.equal(c[0].accion, 'NOTIFICAR_ADMIN');
  assert.equal(c[0].mensajeCliente, undefined);
});

// ── CLASE_MANANA: canal según teléfono ─────────────────────────────────────────
function mananaSlot(): Sesion {
  const d = new Date(NOW.getTime() + 20 * 3600000); // ~mañana
  return sesion({ id: 'ses-manana', inicio: d.toISOString() });
}

test('CLASE_MANANA: socia con teléfono → ENVIAR_WHATSAPP', () => {
  const r = rule({ trigger: 'CLASE_MANANA', condicion: {} });
  const s = socio({ id: 'a', telefono: '+34600000000' });
  const se = mananaSlot();
  const res = reserva({ socioId: 'a', sesionId: se.id, estado: 'CONFIRMADA' });
  const c = computeAutomationCandidatos(input({ automationRules: [r], socios: [s], sesiones: [se], reservas: [res] }), NOW);
  assert.equal(c.length, 1);
  assert.equal(c[0].accion, 'ENVIAR_WHATSAPP');
});

test('CLASE_MANANA: socia sin teléfono → ENVIAR_EMAIL', () => {
  const r = rule({ trigger: 'CLASE_MANANA', condicion: {} });
  const s = socio({ id: 'a', telefono: null });
  const se = mananaSlot();
  const res = reserva({ socioId: 'a', sesionId: se.id, estado: 'CONFIRMADA' });
  const c = computeAutomationCandidatos(input({ automationRules: [r], socios: [s], sesiones: [se], reservas: [res] }), NOW);
  assert.equal(c.length, 1);
  assert.equal(c[0].accion, 'ENVIAR_EMAIL');
});

// ── BONO_SESIONES_BAJAS: cross-sell ────────────────────────────────────────────
test('BONO_SESIONES_BAJAS: 3 bonos seguidos + sin sesiones + hay plan mensual → PROPONER_PLAN', () => {
  const r = rule({ trigger: 'BONO_SESIONES_BAJAS', condicion: { comprasSeguidas: 3 } });
  const s = socio({ id: 'a' });
  const bono = planTarifa({ id: 'plan-bono', tipo: 'BONO', nombre: 'Bono 10' });
  const mensual = planTarifa({ id: 'plan-mensual', tipo: 'MENSUAL', nombre: 'Ilimitado', precio: 79 });
  const subs = [
    suscripcion({ socioId: 'a', planId: 'plan-bono', estado: 'ACTIVA', sesionesRestantes: 0, fechaInicio: diasAntes(1) }),
    suscripcion({ socioId: 'a', planId: 'plan-bono', estado: 'CANCELADA', sesionesRestantes: 0, fechaInicio: diasAntes(30) }),
    suscripcion({ socioId: 'a', planId: 'plan-bono', estado: 'CANCELADA', sesionesRestantes: 0, fechaInicio: diasAntes(60) }),
  ];
  const c = computeAutomationCandidatos(input({ automationRules: [r], socios: [s], suscripciones: subs, planesTarifa: [bono, mensual] }), NOW);
  assert.equal(c.length, 1);
  assert.equal(c[0].accion, 'PROPONER_PLAN');
  assert.equal(c[0].contextoIA?.planSugerido, 'Ilimitado');
});

test('BONO_SESIONES_BAJAS: sin plan mensual en la casa → sin candidato (nada que proponer)', () => {
  const r = rule({ trigger: 'BONO_SESIONES_BAJAS', condicion: { comprasSeguidas: 3 } });
  const s = socio({ id: 'a' });
  const bono = planTarifa({ id: 'plan-bono', tipo: 'BONO', nombre: 'Bono 10' });
  const subs = [
    suscripcion({ socioId: 'a', planId: 'plan-bono', estado: 'ACTIVA', sesionesRestantes: 0, fechaInicio: diasAntes(1) }),
    suscripcion({ socioId: 'a', planId: 'plan-bono', estado: 'CANCELADA', sesionesRestantes: 0, fechaInicio: diasAntes(30) }),
    suscripcion({ socioId: 'a', planId: 'plan-bono', estado: 'CANCELADA', sesionesRestantes: 0, fechaInicio: diasAntes(60) }),
  ];
  const c = computeAutomationCandidatos(input({ automationRules: [r], socios: [s], suscripciones: subs, planesTarifa: [bono] }), NOW);
  assert.equal(c.length, 0);
});

// ── NUEVA_SOCIA: seguimiento de onboarding ─────────────────────────────────────
test('NUEVA_SOCIA: alta hace 3 días, sin reservar → ENVIAR_EMAIL suave', () => {
  const r = rule({ trigger: 'NUEVA_SOCIA', condicion: { diasSinReservar: 2, diasSinAsistir: 10 } });
  const s = socio({ id: 'a', fechaAlta: diasAntes(3) });
  const c = computeAutomationCandidatos(input({ automationRules: [r], socios: [s] }), NOW);
  assert.equal(c.length, 1);
  assert.equal(c[0].accion, 'ENVIAR_EMAIL');
  assert.match(c[0].mensajeCliente ?? '', /horarios/i);
});

test('NUEVA_SOCIA: alta hace 10 días, nunca asistió → NOTIFICAR_ADMIN', () => {
  const r = rule({ trigger: 'NUEVA_SOCIA', condicion: { diasSinReservar: 2, diasSinAsistir: 10 } });
  const s = socio({ id: 'a', fechaAlta: diasAntes(10) });
  const c = computeAutomationCandidatos(input({ automationRules: [r], socios: [s] }), NOW);
  assert.equal(c.length, 1);
  assert.equal(c[0].accion, 'NOTIFICAR_ADMIN');
});

test('NUEVA_SOCIA: ya asistió → sin candidatos', () => {
  const r = rule({ trigger: 'NUEVA_SOCIA', condicion: { diasSinReservar: 2, diasSinAsistir: 10 } });
  const s = socio({ id: 'a', fechaAlta: diasAntes(10) });
  const res = reserva({ socioId: 'a', sesionId: 'x', estado: 'ASISTIDA', creadoEn: diasAntes(5) });
  const c = computeAutomationCandidatos(input({ automationRules: [r], socios: [s], reservas: [res] }), NOW);
  assert.equal(c.length, 0);
});

// ── RENOVACION_COBRADA: confirmación automática ────────────────────────────────
test('RENOVACION_COBRADA: recibo cobrado con suscripción → confirma, y no se repite para el mismo recibo', () => {
  const r = rule({ trigger: 'RENOVACION_COBRADA', condicion: { hitoMeses: 6 } });
  const s = socio({ id: 'a', fechaAlta: diasAntes(400) }); // no cae justo en un múltiplo de 6 meses
  const rec = recibo({ socioId: 'a', estado: 'COBRADO', suscripcionId: 'sus-1' });
  const c1 = computeAutomationCandidatos(input({ automationRules: [r], socios: [s], recibos: [rec] }), NOW);
  assert.equal(c1.length, 1);
  assert.equal(c1[0].accion, 'ENVIAR_EMAIL');

  const logYaConfirmado = log({ ruleId: r.id, socioId: 'a', accion: 'ENVIAR_EMAIL', resultado: 'EJECUTADO', reciboId: rec.id });
  const c2 = computeAutomationCandidatos(input({ automationRules: [r], socios: [s], recibos: [rec], automationLogs: [logYaConfirmado] }), NOW);
  assert.equal(c2.length, 0, 'no debe repetirse para el mismo recibo ya confirmado');
});

test('RENOVACION_COBRADA: recibo sin suscripcionId (venta suelta) → no genera candidato', () => {
  const r = rule({ trigger: 'RENOVACION_COBRADA', condicion: {} });
  const s = socio({ id: 'a' });
  const rec = recibo({ socioId: 'a', estado: 'COBRADO', suscripcionId: null });
  const c = computeAutomationCandidatos(input({ automationRules: [r], socios: [s], recibos: [rec] }), NOW);
  assert.equal(c.length, 0);
});
