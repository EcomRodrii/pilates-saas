import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filtroDeCifras, fraseRespaldada, numerosPermitidos } from './cifras.ts';

const DATOS = [
  '{"activas":84,"dePrueba":6,"cobrado":"1.234,50 €","ocupacion":"62 %","hora":"18:00"}',
  'Hoy es lunes 5 de octubre de 2026 (2026-10-05), hora de Madrid.',
];

test('una frase con cifras que salen de los datos pasa; una inventada no', () => {
  const p = numerosPermitidos(DATOS);
  assert.ok(fraseRespaldada('Tienes 84 alumnas activas y 6 de prueba. ', p));
  assert.ok(fraseRespaldada('Has cobrado 1.234,50 € este mes, con una ocupación del 62 %. ', p));
  assert.ok(fraseRespaldada('Hoy, 5 de octubre, a las 18:00. ', p));
  assert.ok(!fraseRespaldada('Eso es un 15 % más. ', p));
  assert.ok(!fraseRespaldada('Has cobrado 1.300,00 €. ', p));
});

test('las marcas de personas no cuentan como cifras', () => {
  const p = numerosPermitidos(DATOS);
  assert.ok(fraseRespaldada('La que más viene es [ALUMNA_37], y la clase la da [EQUIPO_12]. ', p));
});

test('frase a frase, aunque llegue partida en trozos: la inventada se quita y la siguiente sale', () => {
  const f = filtroDeCifras(DATOS);
  let salida = '';
  for (const trozo of ['Tienes 8', '4 activas. Eso es un 1', '5 % más que', ' en septiembre. Y 6 de', ' prueba.']) salida += f.empujar(trozo);
  salida += f.terminar();
  assert.equal(salida, 'Tienes 84 activas. Y 6 de prueba.');
  assert.equal(f.quitadas(), 1);
});

test('un número que llega de una herramienta recién ejecutada pasa a estar permitido', () => {
  const f = filtroDeCifras([]);
  f.permitir('{"clases":7}');
  assert.equal(f.empujar('Hay 7 clases. ') + f.terminar(), 'Hay 7 clases. ');
});

test('«1.234» o «18:00» no son fin de frase; el final del mensaje sí', () => {
  const f = filtroDeCifras(DATOS);
  assert.equal(f.empujar('A las 18:00 cobraste 1.234,50 € y'), '');
  assert.equal(f.terminar(), 'A las 18:00 cobraste 1.234,50 € y');
});
