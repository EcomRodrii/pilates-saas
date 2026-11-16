import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAN_INFO, ADDONS, LISTA_ADDONS, MESES_PAGADOS_AL_ANO, ahorroAnual, precioAnual } from './entitlements.ts';
import { etiquetaPrecio, euros, importeDe, lineaFacturacion, textoAhorro } from './intervalo-ui.ts';

test('el anual son 10 mensualidades: dos meses gratis', () => {
  assert.equal(MESES_PAGADOS_AL_ANO, 10);
  assert.equal(precioAnual(79), 790);
  assert.equal(ahorroAnual(79), 158);
});

// Los Price anuales de Stripe (creados el 16-nov-2026) cobran 290 / 790 / 2.490 € y
// 220 / 120 / 160 € los complementos. Si alguien toca un precio mensual sin crear
// su Price anual, este test avisa de que lo que se enseña ya no es lo que se cobra.
test('los importes anuales que se enseñan son los de los Price de Stripe', () => {
  assert.equal(importeDe(PLAN_INFO.BASE.precioMes, 'anual'), 290);
  assert.equal(importeDe(PLAN_INFO.ESTUDIO.precioMes, 'anual'), 790);
  assert.equal(importeDe(PLAN_INFO.CADENA.precioMes, 'anual'), 2490);
  const anual = Object.fromEntries(LISTA_ADDONS.map((a) => [a, importeDe(ADDONS[a].precioMes, 'anual')]));
  assert.deepEqual(anual, { decisiones: 220, sustituciones: 120, ia: 160 });
});

test('las etiquetas dicen el periodo y el ahorro en euros', () => {
  assert.equal(etiquetaPrecio(79, 'mensual'), '79€/mes');
  assert.equal(etiquetaPrecio(79, 'anual'), '790€/año');
  assert.equal(etiquetaPrecio(249, 'anual'), '2.490€/año');
  assert.equal(lineaFacturacion(79, 'mensual'), 'IVA incluido');
  assert.equal(lineaFacturacion(79, 'anual'), 'Facturado 790 € al año · IVA incluido');
  assert.equal(textoAhorro(79), 'Ahorras 158 €');
  assert.equal(textoAhorro(249), 'Ahorras 498 €');
  assert.equal(euros(999), '999');
});
