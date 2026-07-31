import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CandidataPriorizada } from './prioridad.ts';
import type { ContextoEstudio } from './tipos.ts';
import { elegirMensajeDelDia, impactoCompensa, esNovedad } from './umbral.ts';

function candidata(p: Partial<CandidataPriorizada> = {}): CandidataPriorizada {
  return {
    especialista: 'RETENCION', tipo: 'RECUPERAR_SOCIA', dedupeKey: 'k1', tituloMotor: 't', motivoMotor: 'm',
    datosUsados: {}, riesgo: 'PERDIDA',
    confianza: { nivel: 'ALTA', evidencia: [], autonomiaMaxima: 2 },
    accion: { tipo: 'CONTACTO_MANUAL', canal: 'LLAMADA', textoSugerido: 'x' },
    tiempoEstimadoMin: 5, expiraEnDias: 14, urgencia: 0.8, esfuerzo: 0.2,
    score: 50, prioridad: 'ALTA',
    ...p,
  };
}

const contextoEstudioPequeno: ContextoEstudio = { nSociasActivas: 80, antiguedadDatosDias: 200, cadenaId: null, nSedesCadena: 1 };
const contextoCadenaGrande: ContextoEstudio = { nSociasActivas: 850, antiguedadDatosDias: 400, cadenaId: 'cad-1', nSedesCadena: 5 };

test('elegirMensajeDelDia: un ganador claro se envía como MENSAJE', () => {
  const c = candidata({ impacto: { valor: 79, unidad: 'EUR_MES', formula: 'x' } });
  const r = elegirMensajeDelDia([c], contextoEstudioPequeno, []);
  assert.equal(r.tipo, 'MENSAJE');
  if (r.tipo === 'MENSAJE') assert.equal(r.candidata.dedupeKey, 'k1');
});

test('elegirMensajeDelDia: sin candidatas → SILENCIO', () => {
  const r = elegirMensajeDelDia([], contextoEstudioPequeno, []);
  assert.equal(r.tipo, 'SILENCIO');
});

test('elegirMensajeDelDia: urgencia baja → no pasa la puerta 1, día de silencio', () => {
  const c = candidata({ urgencia: 0.1, impacto: { valor: 79, unidad: 'EUR_MES', formula: 'x' } });
  const r = elegirMensajeDelDia([c], contextoEstudioPequeno, []);
  assert.equal(r.tipo, 'SILENCIO');
});

test('elegirMensajeDelDia: arbitraje multi-candidata — gana la de mayor score', () => {
  const baja = candidata({ dedupeKey: 'baja', score: 40, impacto: { valor: 79, unidad: 'EUR_MES', formula: 'x' } });
  const alta = candidata({ dedupeKey: 'alta', score: 90, impacto: { valor: 79, unidad: 'EUR_MES', formula: 'x' } });
  const r = elegirMensajeDelDia([baja, alta], contextoEstudioPequeno, []);
  assert.equal(r.tipo, 'MENSAJE');
  if (r.tipo === 'MENSAJE') assert.equal(r.candidata.dedupeKey, 'alta');
});

test('elegirMensajeDelDia: excluida si el piloto automático ya la va a resolver este ciclo', () => {
  const c = candidata({ impacto: { valor: 79, unidad: 'EUR_MES', formula: 'x' } });
  const r = elegirMensajeDelDia([c], contextoEstudioPequeno, [], new Set(['k1']));
  assert.equal(r.tipo, 'SILENCIO');
});

test('elegirMensajeDelDia: NO se excluye si el piloto automático está inactivo (yaAutoResueltas vacío)', () => {
  const c = candidata({ impacto: { valor: 79, unidad: 'EUR_MES', formula: 'x' } });
  const r = elegirMensajeDelDia([c], contextoEstudioPequeno, [], new Set());
  assert.equal(r.tipo, 'MENSAJE');
});

test('esNovedad: mismo dedupeKey y mismo motivo ya enviado → no es novedad', () => {
  const c = candidata({ motivoMotor: 'Hace 18 días que no viene' });
  const historial = [{ dedupeKey: 'k1', motivoMotor: 'Hace 18 días que no viene' }];
  assert.equal(esNovedad(c, historial), false);
});

test('esNovedad: mismo dedupeKey pero motivo distinto (cambio material) → sí es novedad', () => {
  const c = candidata({ motivoMotor: 'Hace 25 días que no viene' });
  const historial = [{ dedupeKey: 'k1', motivoMotor: 'Hace 18 días que no viene' }];
  assert.equal(esNovedad(c, historial), true);
});

test('elegirMensajeDelDia: ya enviada sin cambios → no se repite, día de silencio', () => {
  const c = candidata({ motivoMotor: 'Hace 18 días que no viene', impacto: { valor: 79, unidad: 'EUR_MES', formula: 'x' } });
  const historial = [{ dedupeKey: 'k1', motivoMotor: 'Hace 18 días que no viene' }];
  const r = elegirMensajeDelDia([c], contextoEstudioPequeno, historial);
  assert.equal(r.tipo, 'SILENCIO');
});

test('impactoCompensa: impacto pequeño en un estudio grande no compensa', () => {
  const impacto: import('./tipos.ts').Impacto = { valor: 4, unidad: 'EUR_MES', formula: 'x' };
  assert.equal(impactoCompensa(impacto, contextoCadenaGrande), false);
});

test('impactoCompensa: el mismo impacto sí compensa en un estudio pequeño', () => {
  const impacto: import('./tipos.ts').Impacto = { valor: 4, unidad: 'EUR_MES', formula: 'x' };
  assert.equal(impactoCompensa(impacto, contextoEstudioPequeno), true);
});

test('impactoCompensa: sin impacto medible no bloquea (p.ej. carga de equipo)', () => {
  assert.equal(impactoCompensa(undefined, contextoEstudioPequeno), true);
});

test('elegirMensajeDelDia: impacto insuficiente para el tamaño del estudio → silencio', () => {
  const c = candidata({ impacto: { valor: 4, unidad: 'EUR_MES', formula: 'x' } });
  const r = elegirMensajeDelDia([c], contextoCadenaGrande, []);
  assert.equal(r.tipo, 'SILENCIO');
});
