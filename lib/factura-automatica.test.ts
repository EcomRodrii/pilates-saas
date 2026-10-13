import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emiteFacturaAutomatica, emiteFacturas } from './factura-automatica.ts';

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

test('con el estudio en «sin facturas», no se emite nada, se cobre como se cobre (29-sep-2026)', () => {
  for (const m of ['TARJETA', 'SEPA', 'BIZUM', 'EFECTIVO', null]) {
    assert.equal(emiteFacturaAutomatica(m, 'sin_facturas'), false, String(m));
  }
  // Sin estudio cargado todavía (el panel): tampoco. Una factura optimista que la
  // base de datos rechazaría aparecería y se esfumaría.
  assert.equal(emiteFacturaAutomatica('TARJETA', null), false);
  // Emitiendo: la regla de siempre (el efectivo, fuera).
  assert.equal(emiteFacturaAutomatica('TARJETA', 'verifactu'), true);
  assert.equal(emiteFacturaAutomatica('EFECTIVO', 'verifactu'), false);
  // Sin pasar el modo (los caminos de servidor, que lo resuelve el sellado): como antes.
  assert.equal(emiteFacturaAutomatica('TARJETA'), true);
});

test('factura siempre (2-oct-2026): «facturas» y «verifactu» emiten; «sin_facturas» y sin estudio, no', () => {
  assert.equal(emiteFacturas('facturas'), true);
  assert.equal(emiteFacturas('verifactu'), true);
  assert.equal(emiteFacturas('sin_facturas'), false);
  assert.equal(emiteFacturas(null), false);
  assert.equal(emiteFacturaAutomatica('TARJETA', 'facturas'), true);
  assert.equal(emiteFacturaAutomatica('EFECTIVO', 'facturas'), false, 'el efectivo sigue siendo a elección');
});

test('«Facturar automáticamente» apagado: no sale ninguna sola, sea cual sea el método ni el modo', () => {
  for (const m of ['TARJETA', 'BIZUM', 'TRANSFERENCIA', 'SEPA', 'DATAFONO', 'EFECTIVO', null, undefined]) {
    for (const modo of ['facturas', 'verifactu'] as const) {
      assert.equal(emiteFacturaAutomatica(m, modo, false), false, `${String(m)}/${modo}`);
    }
  }
});

test('«Facturar automáticamente» encendido o sin saber: igual que siempre', () => {
  for (const f of [true, undefined, null]) {
    assert.equal(emiteFacturaAutomatica('TARJETA', 'facturas', f), true);
    assert.equal(emiteFacturaAutomatica('BIZUM', 'verifactu', f), true);
    assert.equal(emiteFacturaAutomatica('EFECTIVO', 'facturas', f), false);
  }
});

test('el ajuste no depende de Veri*Factu: con cualquiera de los dos modos sale igual', () => {
  assert.equal(emiteFacturaAutomatica('TARJETA', 'facturas', true), emiteFacturaAutomatica('TARJETA', 'verifactu', true));
});
