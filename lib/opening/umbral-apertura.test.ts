import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aperturaCallaAlUmbral } from './umbral-apertura.ts';

test('el Umbral solo se calla si el estudio está abriendo Y la apertura ya avisó hoy', () => {
  assert.equal(aperturaCallaAlUmbral({ enVentanaApertura: true, avisosAperturaHoy: 1 }), true);
  // Abriendo pero sin aviso hoy: el mensaje del día compite como siempre (un
  // cobro fallido de una preventa no puede perderse).
  assert.equal(aperturaCallaAlUmbral({ enVentanaApertura: true, avisosAperturaHoy: 0 }), false);
  // Ya operando (o sin apertura): nada cambia.
  assert.equal(aperturaCallaAlUmbral({ enVentanaApertura: false, avisosAperturaHoy: 3 }), false);
});
