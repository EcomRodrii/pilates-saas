import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outcomeInmediato, ventanaDiasDe, medirOutcome, type SenalMedicion } from './outcomes.ts';

// Base de señal "vacía" — cada test solo pisa los campos que le importan, así
// añadir un campo nuevo a SenalMedicion no obliga a tocar todos los tests.
function senal(p: Partial<SenalMedicion> = {}): SenalMedicion {
  return {
    reservaAsistidaPosterior: false, suscripcionCancelada: false, suscripcionRenovada: false,
    recibosCobrados: 0, recibosTotal: 0, importeCobradoEur: 0, precioMensualPlanEur: null,
    ...p,
  };
}

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

test('medirOutcome RECUPERAR_SOCIA: reserva posterior → POSITIVO/RESERVO, sin € (RESERVO no es RENOVO)', () => {
  const r = medirOutcome('RECUPERAR_SOCIA', senal({ reservaAsistidaPosterior: true }));
  assert.deepEqual(r, { outcome: 'POSITIVO', senalObservada: 'RESERVO', impactoReal: null, confianzaMedicion: 'NO_MEDIBLE' });
});

test('medirOutcome RECUPERAR_SOCIA: cancelación pesa como negativo aunque hubiera reservado antes', () => {
  const r = medirOutcome('RECUPERAR_SOCIA', senal({ reservaAsistidaPosterior: true, suscripcionCancelada: true }));
  assert.deepEqual(r, { outcome: 'NEGATIVO', senalObservada: 'CANCELO', impactoReal: null, confianzaMedicion: 'NO_MEDIBLE' });
});

test('medirOutcome RECUPERAR_SOCIA: sin señal → NEUTRO/SIN_RESPUESTA', () => {
  const r = medirOutcome('RECUPERAR_SOCIA', senal());
  assert.deepEqual(r, { outcome: 'NEUTRO', senalObservada: 'SIN_RESPUESTA', impactoReal: null, confianzaMedicion: 'NO_MEDIBLE' });
});

test('medirOutcome ENVIAR_REACTIVACION: renovación con precio resuelto → POSITIVO/RENOVO y € MEDIDO', () => {
  const r = medirOutcome('ENVIAR_REACTIVACION', senal({ suscripcionRenovada: true, precioMensualPlanEur: 39 }));
  assert.deepEqual(r, {
    outcome: 'POSITIVO', senalObservada: 'RENOVO', confianzaMedicion: 'MEDIDO',
    impactoReal: { valor: 39, unidad: 'EUR_MES', formula: 'Precio del plan de la suscripción renovada' },
  });
});

test('medirOutcome ENVIAR_REACTIVACION: renovación sin precio resuelto → POSITIVO pero NO_MEDIBLE', () => {
  const r = medirOutcome('ENVIAR_REACTIVACION', senal({ suscripcionRenovada: true, precioMensualPlanEur: null }));
  assert.equal(r.outcome, 'POSITIVO');
  assert.equal(r.confianzaMedicion, 'NO_MEDIBLE');
  assert.equal(r.impactoReal, null);
});

test('medirOutcome ENVIAR_REACTIVACION: positivo por reserva (no renovación) → NO_MEDIBLE, no se inventa un €', () => {
  const r = medirOutcome('ENVIAR_REACTIVACION', senal({ reservaAsistidaPosterior: true, precioMensualPlanEur: 39 }));
  assert.equal(r.outcome, 'POSITIVO');
  assert.equal(r.senalObservada, 'RESERVO');
  assert.equal(r.confianzaMedicion, 'NO_MEDIBLE');
  assert.equal(r.impactoReal, null);
});

test('medirOutcome RECUPERAR_PAGOS: todos cobrados → POSITIVO; algunos → NEUTRO; ninguno → NEGATIVO', () => {
  assert.equal(medirOutcome('RECUPERAR_PAGOS', senal({ recibosCobrados: 3, recibosTotal: 3 })).outcome, 'POSITIVO');
  assert.equal(medirOutcome('RECUPERAR_PAGOS', senal({ recibosCobrados: 1, recibosTotal: 3 })).outcome, 'NEUTRO');
  assert.equal(medirOutcome('RECUPERAR_PAGOS', senal({ recibosCobrados: 0, recibosTotal: 3 })).outcome, 'NEGATIVO');
});

test('medirOutcome RECUPERAR_PAGOS: siempre MEDIDO, incluido 0€ (cero real, no "sin dato")', () => {
  const positivo = medirOutcome('RECUPERAR_PAGOS', senal({ recibosCobrados: 3, recibosTotal: 3, importeCobradoEur: 87 }));
  assert.deepEqual(positivo.impactoReal, { valor: 87, unidad: 'EUR', formula: 'Suma de los recibos cobrados que la recomendación señaló' });
  assert.equal(positivo.confianzaMedicion, 'MEDIDO');

  const negativo = medirOutcome('RECUPERAR_PAGOS', senal({ recibosCobrados: 0, recibosTotal: 3, importeCobradoEur: 0 }));
  assert.deepEqual(negativo.impactoReal, { valor: 0, unidad: 'EUR', formula: 'Suma de los recibos cobrados que la recomendación señaló' });
  assert.equal(negativo.confianzaMedicion, 'MEDIDO');
});

test('medirOutcome ABRIR_SESION: tipo sin reglas específicas → NEUTRO, sin señal, NO_MEDIBLE', () => {
  const r = medirOutcome('ABRIR_SESION', senal());
  assert.deepEqual(r, { outcome: 'NEUTRO', senalObservada: null, impactoReal: null, confianzaMedicion: 'NO_MEDIBLE' });
});

test('medirOutcome COBRAR_PENDIENTE: si la socia paga → POSITIVO (ya no siempre NEGATIVO), siempre MEDIDO', () => {
  assert.equal(medirOutcome('COBRAR_PENDIENTE', senal({ recibosCobrados: 1, recibosTotal: 1 })).outcome, 'POSITIVO');
  const r = medirOutcome('COBRAR_PENDIENTE', senal({ recibosCobrados: 0, recibosTotal: 1 }));
  assert.equal(r.outcome, 'NEGATIVO');
  assert.equal(r.confianzaMedicion, 'MEDIDO');
});

test('medirOutcome CONTACTAR_LEAD / CONVERTIR_PRUEBA cierran el bucle (antes siempre NEUTRO)', () => {
  assert.deepEqual(medirOutcome('CONTACTAR_LEAD', senal({ suscripcionRenovada: true, precioMensualPlanEur: 29 })), {
    outcome: 'POSITIVO', senalObservada: 'RENOVO', confianzaMedicion: 'MEDIDO',
    impactoReal: { valor: 29, unidad: 'EUR_MES', formula: 'Precio del plan de la suscripción renovada' },
  });
  const neutro = medirOutcome('CONVERTIR_PRUEBA', senal({ reservaAsistidaPosterior: true }));
  assert.equal(neutro.outcome, 'NEUTRO');
  assert.equal(neutro.senalObservada, 'RESERVO');
  assert.equal(neutro.confianzaMedicion, 'NO_MEDIBLE');
  const negativo = medirOutcome('CONTACTAR_LEAD', senal());
  assert.equal(negativo.outcome, 'NEGATIVO');
  assert.equal(negativo.confianzaMedicion, 'NO_MEDIBLE');
});
