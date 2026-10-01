import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLUMNAS, aCentimos, clientaPublica, devolucionPublica, estudioPublico, facturaPublica, reciboPublico,
  suscripcionPublica, tarifaPublica, ventaPublica,
} from './serializar.ts';
import { ESQUEMAS } from './openapi.ts';

// Filas con TODAS las columnas que se piden, y además columnas internas que
// existen en la tabla y no deben salir nunca aunque alguien las añada al select.
const INTERNAS = {
  hash: 'h', terminos_hash: 'x', checkout_session_id: 'cs_1', cobro_mostrador_pi: 'pi_x', studio_id: 'otro-estudio',
  aceptacion_firma: 'firma', stripe_customer_id: 'cus_1', idempotencia_clave: 'k', verifactu_hash: 'vh',
};
const fila = (columnas: string, valores: Record<string, unknown> = {}) => {
  const f: Record<string, unknown> = { ...INTERNAS };
  for (const c of columnas.replace(/\w+\([^)]*\)/g, '').split(',').map(s => s.trim()).filter(Boolean)) f[c] = null;
  return { ...f, ...valores };
};

const CASOS: [string, () => Record<string, unknown>][] = [
  ['Estudio', () => estudioPublico(fila(COLUMNAS.estudio))],
  ['Clienta', () => ({ ...clientaPublica(fila(COLUMNAS.clientaFiscal), true), activo: true, creadoEn: null })],
  ['Recibo', () => reciboPublico(fila(COLUMNAS.recibo, { estado: 'COBRADO', importe: '60.00', importe_devuelto: '15.00' }))],
  ['Factura', () => facturaPublica(fila(COLUMNAS.factura))],
  ['Venta', () => ventaPublica(fila(COLUMNAS.venta, { ventas_pos_lineas: [] }))],
  ['Devolucion', () => devolucionPublica(fila(COLUMNAS.devolucion))],
  ['Suscripcion', () => suscripcionPublica(fila(COLUMNAS.suscripcion, { planes_tarifa: { nombre: 'Bono 10', tipo: 'BONO' } }))],
  ['Tarifa', () => tarifaPublica(fila(COLUMNAS.tarifa))],
];

for (const [nombre, serializar] of CASOS) {
  test(`${nombre}: devuelve exactamente lo que dice la especificación OpenAPI`, () => {
    const props = Object.keys((ESQUEMAS[nombre] as { properties: Record<string, unknown> }).properties).sort();
    assert.deepEqual(Object.keys(serializar()).sort(), props);
  });
  test(`${nombre}: ninguna columna interna sale aunque venga en la fila`, () => {
    const json = JSON.stringify(serializar());
    for (const [k, v] of Object.entries(INTERNAS)) {
      assert.ok(!json.includes(`"${k}"`), `sale la columna interna ${k}`);
      assert.ok(!json.includes(JSON.stringify(v)) || v === 'x', `sale el valor de ${k}`);
    }
  });
}

test('sin el permiso de datos fiscales no salen ni NIF ni dirección', () => {
  const c = clientaPublica(fila(COLUMNAS.clientaFiscal, { nif: '00000000T', direccion: 'Calle Falsa 1' }), false);
  assert.ok(!('nif' in c) && !('direccion' in c));
});

test('importes en céntimos enteros, también desde el texto de un numeric', () => {
  assert.equal(aCentimos('19.99'), 1999);
  assert.equal(aCentimos(0.1 + 0.2), 30);
  assert.equal(aCentimos(null), null);
  const r = reciboPublico(fila(COLUMNAS.recibo, { estado: 'COBRADO', importe: '60.00', importe_devuelto: '15.00' }));
  assert.equal(r.importe, 6000);
  assert.equal(r.importeDevuelto, 1500);
  assert.equal(r.importeIngresado, 4500, 'lo ingresado es neto, la misma regla que las cifras del panel');
  assert.equal(r.moneda, 'EUR');
});

test('un DEVUELTO por el banco es impago y no ingreso; uno reembolsado tampoco es ingreso', () => {
  const banco = reciboPublico(fila(COLUMNAS.recibo, { estado: 'DEVUELTO', importe: 30, importe_devuelto: 0 }));
  assert.equal(banco.situacion, 'IMPAGADO');
  assert.equal(banco.importeIngresado, 0);
  const reemb = reciboPublico(fila(COLUMNAS.recibo, { estado: 'DEVUELTO', importe: 30, importe_devuelto: 30 }));
  assert.equal(reemb.situacion, 'REEMBOLSADO');
});
