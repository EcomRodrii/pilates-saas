import test from 'node:test';
import assert from 'node:assert/strict';
import { claveDePlan, decidirCheckoutPrevio } from './checkout-saas-previo.ts';

// Un Checkout MENSUAL abierto no se reutiliza para quien ahora pide el ANUAL del
// mismo plan: abriría el pago de otra cosa de la que ha elegido.
test('la clave de un Checkout distingue el plan anual del mensual', () => {
  assert.equal(claveDePlan('ESTUDIO', 'anual'), 'ESTUDIO:anual');
  assert.equal(claveDePlan('ESTUDIO', 'mensual'), 'ESTUDIO');
  assert.equal(claveDePlan('ESTUDIO', undefined), 'ESTUDIO', 'los Checkout de antes del anual cuentan como mensuales');
  assert.equal(claveDePlan(null, 'anual'), null);
});

test('un Checkout mensual abierto se caduca al pedir el anual, y se reutiliza si es el mismo periodo', () => {
  const abierta = { id: 'cs_1', url: 'https://pago/1', plan: claveDePlan('ESTUDIO', 'mensual') };
  const alPedirAnual = decidirCheckoutPrevio({ plan: claveDePlan('ESTUDIO', 'anual') as string, suscripciones: [], sesionesAbiertas: [abierta], hayDescuentoNuevo: false });
  assert.equal(alPedirAnual.accion, 'crear');
  assert.deepEqual(alPedirAnual.expirar, ['cs_1']);
  const alPedirMensual = decidirCheckoutPrevio({ plan: claveDePlan('ESTUDIO', 'mensual') as string, suscripciones: [], sesionesAbiertas: [abierta], hayDescuentoNuevo: false });
  assert.equal(alPedirMensual.accion, 'reutilizar');
});
