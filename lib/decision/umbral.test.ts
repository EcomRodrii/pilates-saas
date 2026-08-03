import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CandidataPriorizada } from './prioridad.ts';
import type { ContextoEstudio } from './tipos.ts';
import { elegirMensajeDelDia, impactoCompensa, esNovedad, calibrarUmbral, type TasaSeguimiento } from './umbral.ts';
import type { TipoRecomendacion } from './tipos.ts';

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

// ── Fase 2: Umbral adaptativo por tipo ──────────────────────────────────────

test('calibrarUmbral: sin historial (Map vacío) → sin cambios respecto a Fase 1', () => {
  const r = calibrarUmbral('RECUPERAR_SOCIA', new Map());
  assert.equal(r.urgenciaMin, 0.45);
  assert.equal(r.impactoFactor, 1);
});

test('calibrarUmbral: pocas muestras (< 5) → sin cambios, aunque la tasa sea extrema', () => {
  const tasas = new Map<TipoRecomendacion, TasaSeguimiento>([['RECUPERAR_SOCIA', { total: 3, seguidas: 3 }]]);
  const r = calibrarUmbral('RECUPERAR_SOCIA', tasas);
  assert.equal(r.urgenciaMin, 0.45);
  assert.equal(r.impactoFactor, 1);
});

test('calibrarUmbral: tasa de seguimiento alta (≥80%, ≥5 muestras) → exige menos', () => {
  const tasas = new Map<TipoRecomendacion, TasaSeguimiento>([['RECUPERAR_SOCIA', { total: 10, seguidas: 9 }]]);
  const r = calibrarUmbral('RECUPERAR_SOCIA', tasas);
  assert.equal(r.urgenciaMin, 0.35);
  assert.equal(r.impactoFactor, 0.6);
});

test('calibrarUmbral: tasa de seguimiento baja (≤30%, ≥5 muestras) → exige más', () => {
  const tasas = new Map<TipoRecomendacion, TasaSeguimiento>([['ABRIR_SESION', { total: 10, seguidas: 2 }]]);
  const r = calibrarUmbral('ABRIR_SESION', tasas);
  assert.equal(r.urgenciaMin, 0.60);
  assert.equal(r.impactoFactor, 2);
});

test('calibrarUmbral: tasa intermedia → sin cambios', () => {
  const tasas = new Map<TipoRecomendacion, TasaSeguimiento>([['ABRIR_SESION', { total: 10, seguidas: 5 }]]);
  const r = calibrarUmbral('ABRIR_SESION', tasas);
  assert.equal(r.urgenciaMin, 0.45);
  assert.equal(r.impactoFactor, 1);
});

test('elegirMensajeDelDia: con tasa de seguimiento alta, una urgencia que antes no pasaba ahora sí', () => {
  const c = candidata({ urgencia: 0.4, impacto: { valor: 79, unidad: 'EUR_MES', formula: 'x' } });
  const sinCalibrar = elegirMensajeDelDia([c], contextoEstudioPequeno, []);
  assert.equal(sinCalibrar.tipo, 'SILENCIO');

  const tasas = new Map<TipoRecomendacion, TasaSeguimiento>([['RECUPERAR_SOCIA', { total: 8, seguidas: 8 }]]);
  const conCalibrar = elegirMensajeDelDia([c], contextoEstudioPequeno, [], new Set(), tasas);
  assert.equal(conCalibrar.tipo, 'MENSAJE');
});

test('elegirMensajeDelDia: con tasa de seguimiento baja, el impacto ya no compensa', () => {
  const c = candidata({ tipo: 'ABRIR_SESION', impacto: { valor: 4, unidad: 'EUR_MES', formula: 'x' } });
  const sinCalibrar = elegirMensajeDelDia([c], contextoEstudioPequeno, []);
  assert.equal(sinCalibrar.tipo, 'MENSAJE'); // 4€ sí compensa en un estudio pequeño sin calibrar

  const tasas = new Map<TipoRecomendacion, TasaSeguimiento>([['ABRIR_SESION', { total: 8, seguidas: 1 }]]);
  const conCalibrar = elegirMensajeDelDia([c], contextoEstudioPequeno, [], new Set(), tasas);
  assert.equal(conCalibrar.tipo, 'SILENCIO');
});
