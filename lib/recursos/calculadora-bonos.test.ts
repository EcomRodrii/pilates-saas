import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularBonos } from './calculadora-bonos.ts';

const MEDIANAS = { suelta: 25, descuentoBono5: 14, descuentoBono10: 21, descuentoCuota1: 20, descuentoCuota2: 16, costePorPlaza: 0 };

test('con las medianas de la muestra y una suelta de 25 €: la escalera completa', () => {
  const r = calcularBonos(MEDIANAS);
  const por = Object.fromEntries(r.escalones.map((e) => [e.id, e]));
  assert.equal(por.bono5.precio, 107.5);
  assert.equal(por.bono10.precio, 197.5);
  assert.equal(por.bono10.porSesion, 19.75);
  assert.equal(por.cuota1.precio, 80);
  assert.equal(por.cuota2.porSesion, 16.8);
  assert.equal(por.cuota2.precio, 134.4);
  assert.equal(por.cuota2.ahorro, 33);
  assert.equal(r.bonoCanibalizaCuota, true, '19,75 € el bono frente a 20 € la cuota: el bono sale más barato');
});

test('avisa del escalón que queda por debajo del coste por plaza', () => {
  const r = calcularBonos({ ...MEDIANAS, costePorPlaza: 17 });
  assert.deepEqual(r.escalones.filter((e) => e.porDebajoDelCoste).map((e) => e.id), ['cuota2']);
});

test('un bono menos rebajado que la cuota no la canibaliza', () => {
  assert.equal(calcularBonos({ ...MEDIANAS, descuentoBono10: 15 }).bonoCanibalizaCuota, false);
});

test('valores vacíos o fuera de rango no rompen la cuenta', () => {
  const r = calcularBonos({ ...MEDIANAS, suelta: Number.NaN, descuentoBono5: 140 });
  assert.ok(r.escalones.every((e) => e.precio === 0));
  const tope = calcularBonos({ ...MEDIANAS, descuentoBono5: 140 }).escalones.find((e) => e.id === 'bono5')!;
  assert.equal(tope.ahorro, 95);
});
