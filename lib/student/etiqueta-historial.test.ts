import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etiquetaHistorial } from './etiqueta-historial.ts';

test('una clase reservada y nunca marcada NO se le dice cancelada', () => {
  // El caso que motiva el fichero: CONFIRMADA de una clase ya pasada en la que
  // el estudio no pasó lista. Caía en el `else` de «Cancelada».
  assert.equal(etiquetaHistorial('confirmada').texto, 'Reservada');
  assert.notEqual(etiquetaHistorial('confirmada').texto, 'Cancelada');
});

test('una lista de espera que se quedó fuera tampoco es una cancelación', () => {
  assert.equal(etiquetaHistorial('en-espera').texto, 'Lista de espera');
});

test('las tres que ya se decían bien siguen igual', () => {
  assert.deepEqual(etiquetaHistorial('asistida'), { texto: 'Asistida', tono: 'ok' });
  assert.deepEqual(etiquetaHistorial('no-asistida'), { texto: 'No asistió', tono: 'few' });
  assert.deepEqual(etiquetaHistorial('cancelada'), { texto: 'Cancelada', tono: 'neutral' });
});

test('solo una cancelación de verdad dice «Cancelada»', () => {
  const estados = ['confirmada', 'cancelada', 'asistida', 'no-asistida', 'en-espera'] as const;
  const queDicenCancelada = estados.filter((e) => etiquetaHistorial(e).texto === 'Cancelada');
  assert.deepEqual(queDicenCancelada, ['cancelada']);
});
