import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularBonos } from './calculadora-bonos.ts';

// El ejemplo de la tabla de /recursos/bonos-de-pilates, que es con lo que
// arranca la calculadora: si cambia uno, tiene que cambiar el otro.
const EJEMPLO = { suelta: 25, descuentoBono5: 12, descuentoBono10: 20, descuentoCuota1: 25, descuentoCuota2: 35, costePorPlaza: 0 };

test('con el ejemplo del artículo sale la misma escalera que su tabla', () => {
  const r = calcularBonos(EJEMPLO);
  const por = Object.fromEntries(r.escalones.map((e) => [e.id, e]));
  assert.equal(por.bono5.precio, 110);
  assert.equal(por.bono5.porSesion, 22);
  assert.equal(por.bono10.precio, 200);
  assert.equal(por.cuota1.precio, 75);
  assert.equal(por.cuota1.porSesion, 18.75);
  assert.equal(por.cuota2.porSesion, 16.25);
  assert.equal(por.cuota2.precio, 130);
  assert.equal(por.cuota2.ahorro, 35);
  assert.equal(r.bonoCanibalizaCuota, false, 'el bono de 10 (20 €) sale más caro por sesión que la cuota (18,75 €)');
});

test('el coste por plaza se compara sin IVA', () => {
  // Sin IVA: cuota de 1 a 15,50 € y de 2 a 13,43 €. Con un coste de 14 €, solo
  // la de 2 queda por debajo (comparando con IVA, 16,25 € la habría dado por buena).
  const r = calcularBonos({ ...EJEMPLO, costePorPlaza: 14 });
  assert.deepEqual(r.escalones.filter((e) => e.porDebajoDelCoste).map((e) => e.id), ['cuota2']);
});

test('un bono de 10 más rebajado que la cuota se la come', () => {
  assert.equal(calcularBonos({ ...EJEMPLO, descuentoBono10: 30 }).bonoCanibalizaCuota, true);
});

test('valores vacíos o fuera de rango no rompen la cuenta', () => {
  const r = calcularBonos({ ...EJEMPLO, suelta: Number.NaN, descuentoBono5: 140 });
  assert.ok(r.escalones.every((e) => e.precio === 0));
  const tope = calcularBonos({ ...EJEMPLO, descuentoBono5: 140 }).escalones.find((e) => e.id === 'bono5')!;
  assert.equal(tope.ahorro, 95);
});
