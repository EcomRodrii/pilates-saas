import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emiteFacturaAutomatica } from './factura-automatica.ts';

test('el efectivo no emite factura sola', () => {
  assert.equal(emiteFacturaAutomatica('EFECTIVO'), false);
  // Por si algún camino lo guarda en minúsculas.
  assert.equal(emiteFacturaAutomatica('efectivo'), false);
});

test('los demás medios siguen facturando', () => {
  for (const m of ['TARJETA', 'SEPA', 'BIZUM', 'TRANSFERENCIA'] as const) {
    assert.equal(emiteFacturaAutomatica(m), true, `${m} debería seguir facturando`);
  }
});

test('sin método conocido se factura, como se venía haciendo', () => {
  // ⚠️ 38 recibos de producción tienen `metodo_cobro` a NULL (cobros antiguos y
  // de pasarela). Dejar de facturarlos por no saber el medio sería un cambio
  // mucho mayor que el pedido, y silencioso.
  assert.equal(emiteFacturaAutomatica(null), true);
  assert.equal(emiteFacturaAutomatica(undefined), true);
  assert.equal(emiteFacturaAutomatica(''), true);
});

test('un método nuevo factura hasta que alguien decida lo contrario', () => {
  // La lista es de EXCLUSIÓN: lo que no esté en ella, factura. Al revés —una
  // lista de los que sí— un medio nuevo dejaría de facturarse sin que nadie lo
  // hubiera decidido, y eso no se ve hasta que falta una factura.
  assert.equal(emiteFacturaAutomatica('DATAFONO'), true);
  assert.equal(emiteFacturaAutomatica('CRIPTO'), true);
});
