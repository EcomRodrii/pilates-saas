import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerImporte, queVaAPasar, renovacionYaPendiente } from './que-va-a-pasar.ts';

const NIF_OK = 'B67891234'; // el de las demás pruebas: con formato y sin ser de relleno
const base = { cajaAbierta: true, modoFacturacion: 'verifactu' as const, nifEstudio: NIF_OK, hacerFactura: false };

test('la caja: efectivo, tarjeta y Bizum, solo con una caja abierta; la transferencia no pasa por ella', () => {
  for (const metodo of ['EFECTIVO', 'TARJETA', 'BIZUM'] as const) {
    assert.equal(queVaAPasar({ ...base, metodo }).caja, 'Se apunta en la caja.', metodo);
    assert.equal(queVaAPasar({ ...base, metodo, cajaAbierta: false }).caja, 'No hay caja abierta: no se apunta en la caja.', metodo);
  }
  assert.equal(queVaAPasar({ ...base, metodo: 'TRANSFERENCIA' }).caja, null);
  assert.equal(queVaAPasar({ ...base, metodo: 'EFECTIVO', cajaAbierta: null }).caja, null, 'sin saber si hay caja, no se afirma nada');
});

test('la factura: sola con tarjeta, Bizum o transferencia; en efectivo, solo si se marca «Hacerle factura»', () => {
  assert.deepEqual(queVaAPasar({ ...base, metodo: 'TARJETA' }), { caja: 'Se apunta en la caja.', factura: 'Sale su factura.', saleFactura: true, ofrecerHacerFactura: false });
  const efectivo = queVaAPasar({ ...base, metodo: 'EFECTIVO' });
  assert.equal(efectivo.saleFactura, false);
  assert.equal(efectivo.ofrecerHacerFactura, true);
  assert.match(efectivo.factura ?? '', /marca «Hacerle factura»/);
  const marcada = queVaAPasar({ ...base, metodo: 'EFECTIVO', hacerFactura: true });
  assert.equal(marcada.saleFactura, true);
  assert.equal(marcada.ofrecerHacerFactura, true, 'la casilla sigue ahí para poder desmarcarla');
});

test('sin un NIF fiscal válido del estudio no sale factura, y se dice por qué', () => {
  for (const nif of [null, '', 'B12345678']) {
    const r = queVaAPasar({ ...base, metodo: 'TARJETA', nifEstudio: nif });
    assert.equal(r.saleFactura, false, String(nif));
    assert.match(r.factura ?? '', /falta el NIF fiscal del estudio/);
  }
});

test('un estudio que no factura con Tentare: ni frase de factura ni casilla', () => {
  assert.deepEqual(queVaAPasar({ ...base, metodo: 'EFECTIVO', modoFacturacion: 'sin_facturas' }), { caja: 'Se apunta en la caja.', factura: null, saleFactura: false, ofrecerHacerFactura: false });
  assert.equal(queVaAPasar({ ...base, metodo: 'TARJETA', modoFacturacion: null }).factura, null, 'sin estudio cargado, nada');
});

test('«Es la renovación de su plan»: no si esa cuota ya tiene una renovación pendiente o en el banco', () => {
  const recibos = [
    { suscripcionId: 'sus-1', estado: 'PENDIENTE', esRenovacion: true },
    { suscripcionId: 'sus-2', estado: 'COBRADO', esRenovacion: true },
    { suscripcionId: 'sus-3', estado: 'PENDIENTE', esRenovacion: false },
    { suscripcionId: 'sus-4', estado: 'EN_CURSO', esRenovacion: true },
  ];
  assert.equal(renovacionYaPendiente('sus-1', recibos), true);
  assert.equal(renovacionYaPendiente('sus-2', recibos), false, 'la cobrada ya no es viva');
  assert.equal(renovacionYaPendiente('sus-3', recibos), false, 'una venta no es renovación');
  assert.equal(renovacionYaPendiente('sus-4', recibos), true);
  assert.equal(renovacionYaPendiente(null, recibos), false);
});

test('leerImporte: coma o punto, positivo y con dos decimales como mucho', () => {
  assert.equal(leerImporte('12,5'), 12.5);
  assert.equal(leerImporte(' 85.00 '), 85);
  assert.equal(leerImporte('0'), null);
  assert.equal(leerImporte('-3'), null);
  assert.equal(leerImporte('1.234'), null);
  assert.equal(leerImporte('1.000,50'), null);
  assert.equal(leerImporte('abc'), null);
  assert.equal(leerImporte(''), null);
});
