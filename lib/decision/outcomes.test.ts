import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outcomeInmediato, ventanaDiasDe, medirOutcome } from './outcomes.ts';

test('outcomeInmediato: EJECUTADA queda PENDIENTE de medir; el resto es NEUTRO inmediato', () => {
  assert.equal(outcomeInmediato('EJECUTADA'), 'PENDIENTE');
  assert.equal(outcomeInmediato('RECHAZADA'), 'NEUTRO');
  assert.equal(outcomeInmediato('IGNORADA'), 'NEUTRO');
  assert.equal(outcomeInmediato('APROBADA'), 'NEUTRO');
});

test('ventanaDiasDe: RECUPERAR_PAGOS 3d, ABRIR_SESION 21d, contacto/reactivación 14d', () => {
  assert.equal(ventanaDiasDe('RECUPERAR_PAGOS'), 3);
  assert.equal(ventanaDiasDe('ABRIR_SESION'), 21);
  assert.equal(ventanaDiasDe('RECUPERAR_SOCIA'), 14);
  assert.equal(ventanaDiasDe('ENVIAR_REACTIVACION'), 14);
});

test('medirOutcome RECUPERAR_SOCIA: reserva posterior → POSITIVO/RESERVO', () => {
  const r = medirOutcome('RECUPERAR_SOCIA', { reservaAsistidaPosterior: true, suscripcionCancelada: false, suscripcionRenovada: false, recibosCobrados: 0, recibosTotal: 0 });
  assert.deepEqual(r, { outcome: 'POSITIVO', senalObservada: 'RESERVO' });
});

test('medirOutcome RECUPERAR_SOCIA: cancelación pesa como negativo aunque hubiera reservado antes', () => {
  const r = medirOutcome('RECUPERAR_SOCIA', { reservaAsistidaPosterior: true, suscripcionCancelada: true, suscripcionRenovada: false, recibosCobrados: 0, recibosTotal: 0 });
  assert.deepEqual(r, { outcome: 'NEGATIVO', senalObservada: 'CANCELO' });
});

test('medirOutcome RECUPERAR_SOCIA: sin señal → NEUTRO/SIN_RESPUESTA', () => {
  const r = medirOutcome('RECUPERAR_SOCIA', { reservaAsistidaPosterior: false, suscripcionCancelada: false, suscripcionRenovada: false, recibosCobrados: 0, recibosTotal: 0 });
  assert.deepEqual(r, { outcome: 'NEUTRO', senalObservada: 'SIN_RESPUESTA' });
});

test('medirOutcome ENVIAR_REACTIVACION: renovación → POSITIVO/RENOVO', () => {
  const r = medirOutcome('ENVIAR_REACTIVACION', { reservaAsistidaPosterior: false, suscripcionCancelada: false, suscripcionRenovada: true, recibosCobrados: 0, recibosTotal: 0 });
  assert.deepEqual(r, { outcome: 'POSITIVO', senalObservada: 'RENOVO' });
});

test('medirOutcome RECUPERAR_PAGOS: todos cobrados → POSITIVO; algunos → NEUTRO; ninguno → NEGATIVO', () => {
  assert.equal(medirOutcome('RECUPERAR_PAGOS', { reservaAsistidaPosterior: false, suscripcionCancelada: false, suscripcionRenovada: false, recibosCobrados: 3, recibosTotal: 3 }).outcome, 'POSITIVO');
  assert.equal(medirOutcome('RECUPERAR_PAGOS', { reservaAsistidaPosterior: false, suscripcionCancelada: false, suscripcionRenovada: false, recibosCobrados: 1, recibosTotal: 3 }).outcome, 'NEUTRO');
  assert.equal(medirOutcome('RECUPERAR_PAGOS', { reservaAsistidaPosterior: false, suscripcionCancelada: false, suscripcionRenovada: false, recibosCobrados: 0, recibosTotal: 3 }).outcome, 'NEGATIVO');
});

test('medirOutcome ABRIR_SESION: tipo sin reglas específicas → NEUTRO, sin señal', () => {
  const r = medirOutcome('ABRIR_SESION', { reservaAsistidaPosterior: false, suscripcionCancelada: false, suscripcionRenovada: false, recibosCobrados: 0, recibosTotal: 0 });
  assert.deepEqual(r, { outcome: 'NEUTRO', senalObservada: null });
});

test('medirOutcome COBRAR_PENDIENTE: si la socia paga → POSITIVO (ya no siempre NEGATIVO)', () => {
  assert.equal(medirOutcome('COBRAR_PENDIENTE', { reservaAsistidaPosterior: false, suscripcionCancelada: false, suscripcionRenovada: false, recibosCobrados: 1, recibosTotal: 1 }).outcome, 'POSITIVO');
  assert.equal(medirOutcome('COBRAR_PENDIENTE', { reservaAsistidaPosterior: false, suscripcionCancelada: false, suscripcionRenovada: false, recibosCobrados: 0, recibosTotal: 1 }).outcome, 'NEGATIVO');
});

test('medirOutcome CONTACTAR_LEAD / CONVERTIR_PRUEBA cierran el bucle (antes siempre NEUTRO)', () => {
  const base = { reservaAsistidaPosterior: false, suscripcionCancelada: false, suscripcionRenovada: false, recibosCobrados: 0, recibosTotal: 0 };
  assert.deepEqual(medirOutcome('CONTACTAR_LEAD', { ...base, suscripcionRenovada: true }), { outcome: 'POSITIVO', senalObservada: 'RENOVO' });
  assert.deepEqual(medirOutcome('CONVERTIR_PRUEBA', { ...base, reservaAsistidaPosterior: true }), { outcome: 'NEUTRO', senalObservada: 'RESERVO' });
  assert.deepEqual(medirOutcome('CONTACTAR_LEAD', base), { outcome: 'NEGATIVO', senalObservada: 'SIN_RESPUESTA' });
});
