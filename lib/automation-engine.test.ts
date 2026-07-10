// Tests del motor de automatizaciones (el diferenciador). Runner nativo de Node.
// Blindan que la optimización P0-19 (índices compartidos + ventana) no cambia
// qué candidatos se detectan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AutomationRule, AutomationLog, Socio, Reserva, Sesion, TipoClase, Recibo } from '@/lib/types';
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
  return { id: `log-${++n}`, studioId: 'e1', ruleName: 'R', socioId: null, socioNombre: null, pasoIndex: 0, accion: 'ENVIAR_EMAIL', detalle: '', ejecutadoEn: diasAntes(1), proximaAccionEn: null, ...p };
}
function input(over: Partial<AutomationEngineInput>): AutomationEngineInput {
  return { automationRules: [], automationLogs: [], socios: [], reservas: [], recibos: [] as Recibo[], sesiones: [], tiposClase: [tipo], ...over };
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
});

test('AUSENCIA_DIAS: hace 25d (>= crítico) → OFRECER_DESCUENTO', () => {
  const r = rule({ trigger: 'AUSENCIA_DIAS', condicion: { dias: 7, diasCritico: 21, descuentoPct: 15 } });
  const s = socio({ id: 'a' });
  const res = reserva({ socioId: 'a', sesionId: 'x', estado: 'ASISTIDA', creadoEn: diasAntes(25) });
  const c = computeAutomationCandidatos(input({ automationRules: [r], socios: [s], reservas: [res] }), NOW);
  assert.equal(c.length, 1);
  assert.equal(c[0].accion, 'OFRECER_DESCUENTO');
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

test('AUSENCIA_DIAS: dedup por log ESPERANDO existente', () => {
  const r = rule({ trigger: 'AUSENCIA_DIAS', condicion: { dias: 7 } });
  const s = socio({ id: 'a' });
  const res = reserva({ socioId: 'a', sesionId: 'x', estado: 'ASISTIDA', creadoEn: diasAntes(10) });
  const l = log({ ruleId: r.id, socioId: 'a', resultado: 'ESPERANDO' });
  const c = computeAutomationCandidatos(input({ automationRules: [r], socios: [s], reservas: [res], automationLogs: [l] }), NOW);
  assert.equal(c.length, 0);
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
