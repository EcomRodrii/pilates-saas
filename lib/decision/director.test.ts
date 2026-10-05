import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Candidata, Recomendacion } from './tipos.ts';
import type { CandidataPriorizada } from './prioridad.ts';
import type { ResumenCobro } from './resultado-ejecucion.ts';
import type { AutomationLog, Reserva } from '@/lib/types';
import {
  coordinarColisiones, calcularEstadoGeneral, calcularResumenEjecutivo, construirMientrasDormias,
  generarSaludo, calcularEstadoEspecialista,
} from './director.ts';

const NOW = new Date('2026-07-11T12:00:00.000Z');
const diasAntes = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

function candidata(p: Partial<Candidata> = {}): Candidata {
  return {
    especialista: 'RETENCION', tipo: 'RECUPERAR_SOCIA', dedupeKey: 'k', tituloMotor: 't', motivoMotor: 'm',
    datosUsados: {}, riesgo: 'PERDIDA', impacto: { valor: 89, unidad: 'EUR_MES', formula: 'f' },
    confianza: { nivel: 'ALTA', evidencia: [], autonomiaMaxima: 2 },
    accion: { tipo: 'CONTACTO_MANUAL', canal: 'WHATSAPP', textoSugerido: '' },
    socioId: 'a', tiempoEstimadoMin: 2, expiraEnDias: 10, urgencia: 0.5, esfuerzo: 0.2,
    ...p,
  };
}
function priorizada(p: Partial<CandidataPriorizada> = {}): CandidataPriorizada {
  return { ...candidata(), score: 50, prioridad: 'ALTA', ...p };
}

// ── coordinación ──────────────────────────────────────────────────────────

test('coordinarColisiones: dos candidatas de la misma socia → gana la de mayor score, la otra queda de contexto', () => {
  const floja = candidata({ especialista: 'INGRESOS', socioId: 'a', tituloMotor: 'Insight menor', impacto: { valor: 5, unidad: 'EUR_MES', formula: '' }, urgencia: 0.1, esfuerzo: 0.9 });
  const fuerte = candidata({ especialista: 'RETENCION', socioId: 'a', tituloMotor: 'Riesgo real', impacto: { valor: 400, unidad: 'EUR_MES', formula: '' }, urgencia: 1, esfuerzo: 0 });
  const resultado = coordinarColisiones([floja, fuerte]);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].tituloMotor, 'Riesgo real');
  assert.ok(String(resultado[0].datosUsados.contextoAdicional).includes('Insight menor'));
});

test('coordinarColisiones: candidatas de socias distintas no se fusionan', () => {
  const c1 = candidata({ socioId: 'a' });
  const c2 = candidata({ socioId: 'b' });
  assert.equal(coordinarColisiones([c1, c2]).length, 2);
});

test('coordinarColisiones: candidatas sin socioId (insight de negocio) pasan intactas', () => {
  const c = candidata({ socioId: undefined, especialista: 'INGRESOS', tipo: 'ABRIR_SESION' });
  const resultado = coordinarColisiones([c]);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].datosUsados.contextoAdicional, undefined);
});

// ── estado general ────────────────────────────────────────────────────────

test('calcularEstadoGeneral: hay CRITICA → ACCION_INMEDIATA', () => {
  const puntuadas = [priorizada({ prioridad: 'CRITICA', riesgo: 'PERDIDA' })];
  assert.equal(calcularEstadoGeneral(puntuadas), 'ACCION_INMEDIATA');
});

test('calcularEstadoGeneral: sin CRITICA, con ALTA+PERDIDA → ATENCION', () => {
  const puntuadas = [priorizada({ prioridad: 'ALTA', riesgo: 'PERDIDA' })];
  assert.equal(calcularEstadoGeneral(puntuadas), 'ATENCION');
});

test('calcularEstadoGeneral: ALTA de oportunidad (sin CRITICA ni PERDIDA) → EXCELENTE', () => {
  const puntuadas = [priorizada({ prioridad: 'ALTA', riesgo: 'OPORTUNIDAD' })];
  assert.equal(calcularEstadoGeneral(puntuadas), 'EXCELENTE');
});

test('calcularEstadoGeneral: sin candidatas → EXCELENTE', () => {
  assert.equal(calcularEstadoGeneral([]), 'EXCELENTE');
});

// ── resumen ejecutivo ──────────────────────────────────────────────────────

test('calcularResumenEjecutivo: suma tiempos e impactos de las tarjetas visibles', () => {
  const prioridades = [
    priorizada({ tiempoEstimadoMin: 2, impacto: { valor: 89, unidad: 'EUR_MES', formula: '' } }),
    priorizada({ tiempoEstimadoMin: 10, impacto: { valor: 620, unidad: 'EUR_MES', formula: '' } }),
  ];
  const r = calcularResumenEjecutivo(prioridades);
  assert.equal(r.nDecisiones, 2);
  assert.equal(r.tiempoEstimadoMin, 12);
  assert.equal(r.impactoTotal?.valor, 709);
});

test('calcularResumenEjecutivo: sin impacto en ninguna tarjeta → impactoTotal null', () => {
  const r = calcularResumenEjecutivo([priorizada({ impacto: undefined })]);
  assert.equal(r.impactoTotal, null);
});

// ── mientras dormías ───────────────────────────────────────────────────────

function recomendacion(p: Partial<Recomendacion> = {}): Recomendacion {
  return {
    id: 'r', studioId: 'e1', decisionSessionId: 'ds1', algorithmVersion: '1.0.0', especialista: 'INGRESOS',
    tipo: 'RECUPERAR_PAGOS', dedupeKey: 'k', titulo: 't', motivo: 'm', datosUsados: {}, riesgo: 'PERDIDA',
    impacto: null, confianza: { nivel: 'ALTA', evidencia: [], autonomiaMaxima: 2 }, score: 50, prioridad: 'ALTA',
    nivelAutonomia: 2, accion: { tipo: 'MARCAR_GESTIONADO' }, socioId: null, sesionId: null, reciboId: null,
    tiempoEstimadoMin: 1, estado: 'EJECUTADA', vistaEn: null, expiraEn: diasAntes(-7), creadoEn: diasAntes(1), resueltoEn: diasAntes(0),
    resueltoPor: 'u1',
    ...p,
  };
}
function log(p: Partial<AutomationLog> & Pick<AutomationLog, 'socioId'>): AutomationLog {
  return { id: 'l', studioId: 'e1', ruleId: 'r', automatizacionId: null, ruleName: 'R', resultado: 'EJECUTADO', accion: 'ENVIAR_EMAIL', socioNombre: null, pasoIndex: 0, detalle: '', ejecutadoEn: diasAntes(1), proximaAccionEn: null, ...p };
}
function reserva(p: Partial<Reserva> & Pick<Reserva, 'socioId'>): Reserva {
  return { id: 'res', studioId: 'e1', sesionId: 'ses1', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, ofertaExpiraEn: null, checkInEn: null, creadoEn: diasAntes(0.5), ...p };
}

function resumenCobro(p: Partial<ResumenCobro> = {}): ResumenCobro {
  return {
    recibos: 5, cobrados: 0, importeCobradoEur: 0, enCurso: 0, importeEnCursoEur: 0, yaNoPendientes: 0,
    sinConfirmar: 0, motivosSinConfirmar: [], noCobrados: 0, motivosNoCobrados: [], ...p,
  };
}

test('construirMientrasDormias: un cobro que aprobó la propietaria no es «mientras dormías»', () => {
  // COBRAR_RECIBOS nunca es autónomo: lo aprobó ella, y su resultado lo ve en la
  // tarjeta y en Actividad, no bajo «Ejecutado automáticamente».
  const rec = recomendacion({
    tipo: 'RECUPERAR_PAGOS', resueltoPor: 'u1', datosUsados: { n: 4, total: 320 },
    resultado: { detalle: 'Cobrados los 4 recibos: 320 €.', cobro: resumenCobro({ recibos: 4, cobrados: 4, importeCobradoEur: 320 }) },
  });
  assert.equal(construirMientrasDormias({ recomendacionesEjecutadas: [rec], automationLogs: [], reservasNuevas: [] }).length, 0);
});

test('construirMientrasDormias: cuenta lo que se cobró de verdad, no lo que el análisis pensaba cobrar', () => {
  // 5 recibos y 150 € en el análisis; entró 1 de 30 €, dos se rechazaron y dos ya estaban pagados.
  const rec = recomendacion({
    tipo: 'RECUPERAR_PAGOS', resueltoPor: 'AUTONOMIA', datosUsados: { n: 5, total: 150 },
    resultado: {
      detalle: 'x',
      cobro: resumenCobro({ recibos: 5, cobrados: 1, importeCobradoEur: 30, yaNoPendientes: 2, noCobrados: 2, motivosNoCobrados: ['Rechazada'] }),
    },
  });
  const items = construirMientrasDormias({ recomendacionesEjecutadas: [rec], automationLogs: [], reservasNuevas: [] });
  assert.equal(items.length, 1);
  assert.match(items[0].texto, /5 pagos/);
  assert.match(items[0].texto, /cobré 1: 30€/);
  assert.doesNotMatch(items[0].texto, /150/);
});

test('construirMientrasDormias: sin resultado guardado, o sin nada cobrado, no se afirma ningún cobro', () => {
  const sinResultado = recomendacion({ tipo: 'RECUPERAR_PAGOS', resueltoPor: 'AUTONOMIA', datosUsados: { n: 4, total: 320 } });
  const nadaCobrado = recomendacion({
    tipo: 'RECUPERAR_PAGOS', resueltoPor: 'AUTONOMIA',
    resultado: { detalle: 'x', cobro: resumenCobro({ recibos: 2, enCurso: 2, importeEnCursoEur: 60 }) },
  });
  assert.equal(construirMientrasDormias({ recomendacionesEjecutadas: [sinResultado, nadaCobrado], automationLogs: [], reservasNuevas: [] }).length, 0);
});

test('construirMientrasDormias: todo cobrado → «Cobrados» con el total real', () => {
  const rec = recomendacion({
    tipo: 'RECUPERAR_PAGOS', resueltoPor: 'AUTONOMIA',
    resultado: { detalle: 'x', cobro: resumenCobro({ recibos: 4, cobrados: 4, importeCobradoEur: 320 }) },
  });
  const items = construirMientrasDormias({ recomendacionesEjecutadas: [rec], automationLogs: [], reservasNuevas: [] });
  assert.equal(items.length, 1);
  assert.ok(items[0].texto.includes('4 pagos'));
  assert.ok(items[0].texto.includes('Cobrados: 320€'));
});

test('construirMientrasDormias: atribuye reserva solo con vínculo temporal verificado', () => {
  const logs = [log({ socioId: 'a', ejecutadoEn: diasAntes(1) })];
  const reservasConVinculo = [reserva({ socioId: 'a', creadoEn: diasAntes(0.5) })];
  const items = construirMientrasDormias({ recomendacionesEjecutadas: [], automationLogs: logs, reservasNuevas: reservasConVinculo });
  assert.ok(items[0].texto.includes('han vuelto a reservar'));
});

test('construirMientrasDormias: sin vínculo temporal no se atribuye el mérito (regla anti-exageración)', () => {
  const logs = [log({ socioId: 'a', ejecutadoEn: diasAntes(1) })];
  const items = construirMientrasDormias({ recomendacionesEjecutadas: [], automationLogs: logs, reservasNuevas: [] });
  assert.equal(items.length, 1);
  assert.ok(!items[0].texto.includes('han vuelto a reservar'));
});

test('construirMientrasDormias: sin actividad en la ventana → lista vacía (nunca relleno)', () => {
  assert.equal(construirMientrasDormias({ recomendacionesEjecutadas: [], automationLogs: [], reservasNuevas: [] }).length, 0);
});

// ── saludo ────────────────────────────────────────────────────────────────

test('generarSaludo: ACCION_INMEDIATA siempre apunta a la primera tarjeta', () => {
  const s = generarSaludo('Marco', 'MANANA', 'ACCION_INMEDIATA', 3, 10);
  assert.ok(s.includes('no puede esperar'));
});

test('generarSaludo: EXCELENTE con 0 decisiones dice que no hace falta nada', () => {
  const s = generarSaludo('Marco', 'MANANA', 'EXCELENTE', 0, 0);
  assert.ok(s.includes('no necesito nada'));
});

test('generarSaludo: EXCELENTE con decisiones pendientes, tono del mockup', () => {
  const s = generarSaludo('Marco', 'MANANA', 'EXCELENTE', 2, 6);
  assert.ok(s.includes('Buenos días, Marco'));
  assert.ok(s.includes('2 cosas'));
});

// ── estado por especialista ────────────────────────────────────────────────

test('calcularEstadoEspecialista: CRITICO > ATENCION > BUENO > EXCELENTE', () => {
  assert.equal(calcularEstadoEspecialista([priorizada({ prioridad: 'CRITICA' })]), 'CRITICO');
  assert.equal(calcularEstadoEspecialista([priorizada({ prioridad: 'ALTA', riesgo: 'PERDIDA' })]), 'ATENCION');
  assert.equal(calcularEstadoEspecialista([priorizada({ prioridad: 'MEDIA', riesgo: 'OPORTUNIDAD' })]), 'BUENO');
  assert.equal(calcularEstadoEspecialista([]), 'EXCELENTE');
});
