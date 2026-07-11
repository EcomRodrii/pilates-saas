import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Candidata, Recomendacion } from './tipos.ts';
import {
  PESOS, calcularScore, calcularPrioridad, enCooldown, calcularAjusteFeedback,
  priorizar, seleccionarPrioridadesHome, type CandidataPriorizada,
} from './prioridad.ts';

const NOW = new Date('2026-07-11T12:00:00.000Z');
const diasAntes = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

function candidata(p: Partial<Candidata> = {}): Candidata {
  return {
    especialista: 'RETENCION', tipo: 'RECUPERAR_SOCIA', dedupeKey: 'RETENCION:RECUPERAR_SOCIA:a',
    tituloMotor: 't', motivoMotor: 'm', datosUsados: {}, riesgo: 'PERDIDA',
    impacto: { valor: 89, unidad: 'EUR_MES', formula: 'f' },
    confianza: { nivel: 'ALTA', evidencia: [], autonomiaMaxima: 2 },
    accion: { tipo: 'CONTACTO_MANUAL', canal: 'WHATSAPP', textoSugerido: '' },
    socioId: 'a', tiempoEstimadoMin: 2, expiraEnDias: 10, urgencia: 0.5, esfuerzo: 0.2,
    ...p,
  };
}

function recomendacion(p: Partial<Recomendacion> & Pick<Recomendacion, 'tipo' | 'dedupeKey' | 'estado'>): Recomendacion {
  return {
    id: 'r', studioId: 'e1', decisionSessionId: 'ds1', algorithmVersion: '1.0.0', especialista: 'RETENCION',
    titulo: 't', motivo: 'm', datosUsados: {}, riesgo: 'PERDIDA', impacto: null,
    confianza: { nivel: 'ALTA', evidencia: [], autonomiaMaxima: 2 }, score: 50, prioridad: 'ALTA',
    nivelAutonomia: 1, accion: { tipo: 'MARCAR_GESTIONADO' }, socioId: 'a', sesionId: null, reciboId: null,
    tiempoEstimadoMin: 2, vistaEn: null, expiraEn: diasAntes(-10), creadoEn: diasAntes(20), resueltoEn: diasAntes(5),
    resueltoPor: 'u1',
    ...p,
  };
}

// ── score ──────────────────────────────────────────────────────────────────

test('calcularScore: mayor impacto, confianza, urgencia y menor esfuerzo → score mayor', () => {
  const base = candidata({ impacto: { valor: 50, unidad: 'EUR_MES', formula: '' }, urgencia: 0.2, esfuerzo: 0.8, confianza: { nivel: 'BAJA', evidencia: [], autonomiaMaxima: 0 } });
  const mejor = candidata({ impacto: { valor: 500, unidad: 'EUR_MES', formula: '' }, urgencia: 1, esfuerzo: 0, confianza: { nivel: 'ALTA', evidencia: [], autonomiaMaxima: 2 } });
  assert.ok(calcularScore(mejor, 1) > calcularScore(base, 1));
});

test('calcularScore: sin impacto declarado usa PESOS.impactoSinDato, no cero', () => {
  const sinImpacto = candidata({ impacto: undefined });
  const conImpactoBajo = candidata({ impacto: { valor: 0, unidad: 'EUR_MES', formula: '' } });
  assert.ok(calcularScore(sinImpacto, 1) > calcularScore(conImpactoBajo, 1));
});

test('calcularScore: candidata floja en un eje no puede colarse arriba (multiplicativo)', () => {
  // impacto altísimo pero esfuerzo=1 y urgencia=0 y confianza BAJA → score bajo igualmente
  const c = candidata({ impacto: { valor: 500, unidad: 'EUR_MES', formula: '' }, urgencia: 0, esfuerzo: 1, confianza: { nivel: 'BAJA', evidencia: [], autonomiaMaxima: 0 } });
  assert.ok(calcularScore(c, 1) < 20);
});

// ── prioridad y confianza BAJA ────────────────────────────────────────────

test('calcularPrioridad: confianza BAJA nunca supera MEDIA aunque el score sea altísimo', () => {
  assert.equal(calcularPrioridad(99, 'PERDIDA', 'BAJA'), 'MEDIA');
});

test('calcularPrioridad: CRITICA exige riesgo PERDIDA, no solo score alto', () => {
  assert.equal(calcularPrioridad(80, 'OPORTUNIDAD', 'ALTA'), 'ALTA');
  assert.equal(calcularPrioridad(80, 'PERDIDA', 'ALTA'), 'CRITICA');
});

// ── cooldown ──────────────────────────────────────────────────────────────

test('enCooldown: RECHAZADA reciente del mismo dedupeKey suprime (ventana completa)', () => {
  const c = candidata({ tipo: 'RECUPERAR_SOCIA', dedupeKey: 'RETENCION:RECUPERAR_SOCIA:a' });
  const resueltas = [recomendacion({ tipo: 'RECUPERAR_SOCIA', dedupeKey: 'RETENCION:RECUPERAR_SOCIA:a', estado: 'RECHAZADA', resueltoEn: diasAntes(5) })];
  assert.equal(enCooldown(c, resueltas, NOW), true);
});

test('enCooldown: RECHAZADA fuera de la ventana de 21d no suprime', () => {
  const c = candidata({ tipo: 'RECUPERAR_SOCIA', dedupeKey: 'RETENCION:RECUPERAR_SOCIA:a' });
  const resueltas = [recomendacion({ tipo: 'RECUPERAR_SOCIA', dedupeKey: 'RETENCION:RECUPERAR_SOCIA:a', estado: 'RECHAZADA', resueltoEn: diasAntes(25) })];
  assert.equal(enCooldown(c, resueltas, NOW), false);
});

test('enCooldown: EXPIRADA cuenta la mitad de la ventana', () => {
  const c = candidata({ tipo: 'RECUPERAR_SOCIA', dedupeKey: 'RETENCION:RECUPERAR_SOCIA:a' });
  const resueltas = [recomendacion({ tipo: 'RECUPERAR_SOCIA', dedupeKey: 'RETENCION:RECUPERAR_SOCIA:a', estado: 'EXPIRADA', resueltoEn: diasAntes(9) })];
  assert.equal(enCooldown(c, resueltas, NOW), true); // 9 < 21/2=10.5
  const resueltasFuera = [recomendacion({ tipo: 'RECUPERAR_SOCIA', dedupeKey: 'RETENCION:RECUPERAR_SOCIA:a', estado: 'EXPIRADA', resueltoEn: diasAntes(15) })];
  assert.equal(enCooldown(c, resueltasFuera, NOW), false); // 15 > 10.5
});

test('enCooldown: dedupeKey distinto no afecta', () => {
  const c = candidata({ dedupeKey: 'RETENCION:RECUPERAR_SOCIA:b' });
  const resueltas = [recomendacion({ tipo: 'RECUPERAR_SOCIA', dedupeKey: 'RETENCION:RECUPERAR_SOCIA:a', estado: 'RECHAZADA', resueltoEn: diasAntes(1) })];
  assert.equal(enCooldown(c, resueltas, NOW), false);
});

// ── ajuste de feedback ─────────────────────────────────────────────────────

test('calcularAjusteFeedback: cada rechazo resta 10%, con piso 0.7', () => {
  const dos = [
    recomendacion({ tipo: 'RECUPERAR_SOCIA', dedupeKey: 'k1', estado: 'RECHAZADA', resueltoEn: diasAntes(10) }),
    recomendacion({ tipo: 'RECUPERAR_SOCIA', dedupeKey: 'k2', estado: 'RECHAZADA', resueltoEn: diasAntes(5) }),
  ];
  assert.ok(Math.abs(calcularAjusteFeedback('RECUPERAR_SOCIA', dos) - 0.8) < 1e-9);
  const cinco = Array.from({ length: 5 }, (_, i) => recomendacion({ tipo: 'RECUPERAR_SOCIA', dedupeKey: `k${i}`, estado: 'RECHAZADA', resueltoEn: diasAntes(10 - i) }));
  assert.equal(calcularAjusteFeedback('RECUPERAR_SOCIA', cinco), PESOS.ajusteFeedbackPiso);
});

test('calcularAjusteFeedback: una EJECUTADA restaura el ajuste a 1', () => {
  const secuencia = [
    recomendacion({ tipo: 'RECUPERAR_SOCIA', dedupeKey: 'k1', estado: 'RECHAZADA', resueltoEn: diasAntes(20) }),
    recomendacion({ tipo: 'RECUPERAR_SOCIA', dedupeKey: 'k2', estado: 'EJECUTADA', resueltoEn: diasAntes(10) }),
  ];
  assert.equal(calcularAjusteFeedback('RECUPERAR_SOCIA', secuencia), 1);
});

// ── caps y desempate ────────────────────────────────────────────────────────

test('priorizar: cap global ≤3 CRITICA, el excedente degrada a ALTA por score', () => {
  const candidatas = Array.from({ length: 5 }, (_, i) => candidata({
    dedupeKey: `k${i}`, socioId: `s${i}`,
    impacto: { valor: 500 - i, unidad: 'EUR_MES', formula: '' }, urgencia: 1, esfuerzo: 0,
  }));
  const puntuadas = priorizar(candidatas, [], NOW);
  const criticas = puntuadas.filter(c => c.prioridad === 'CRITICA');
  assert.ok(criticas.length <= PESOS.capCriticasGlobal);
  assert.equal(puntuadas.length, 5); // nadie desaparece, solo se degrada
});

test('seleccionarPrioridadesHome: máximo 3 tarjetas y máximo 2 por especialista', () => {
  const retencion: CandidataPriorizada[] = Array.from({ length: 3 }, (_, i) => ({
    ...candidata({ dedupeKey: `r${i}`, socioId: `r${i}` }), score: 90 - i, prioridad: 'CRITICA' as const,
  }));
  const ingresos: CandidataPriorizada[] = Array.from({ length: 3 }, (_, i) => ({
    ...candidata({ especialista: 'INGRESOS', dedupeKey: `i${i}`, socioId: undefined, riesgo: 'OPORTUNIDAD' }),
    score: 80 - i, prioridad: 'ALTA' as const,
  }));
  const seleccion = seleccionarPrioridadesHome([...retencion, ...ingresos]);
  assert.equal(seleccion.length, 3);
  const porEspecialista = new Map<string, number>();
  for (const c of seleccion) porEspecialista.set(c.especialista, (porEspecialista.get(c.especialista) ?? 0) + 1);
  assert.ok([...porEspecialista.values()].every(n => n <= PESOS.capPorEspecialistaEnPrioridades));
});

test('seleccionarPrioridadesHome: desempate por riesgo PERDIDA antes que OPORTUNIDAD a igual score', () => {
  const perdida: CandidataPriorizada = { ...candidata({ dedupeKey: 'p', socioId: 'p', riesgo: 'PERDIDA' }), score: 60, prioridad: 'ALTA' };
  const oportunidad: CandidataPriorizada = { ...candidata({ especialista: 'INGRESOS', dedupeKey: 'o', socioId: undefined, riesgo: 'OPORTUNIDAD' }), score: 60, prioridad: 'ALTA' };
  const seleccion = seleccionarPrioridadesHome([oportunidad, perdida]);
  assert.equal(seleccion[0].dedupeKey, 'p');
});
