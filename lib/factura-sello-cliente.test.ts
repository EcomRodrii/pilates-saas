import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selloParaCliente, LEYENDA_VERIFACTU } from './factura-sello-cliente.ts';

const SELLADA = {
  numeroCompleto: 'F2026/0001',
  fechaEmision: '2026-08-01',
  total: 100,
  verifactuHash: 'a'.repeat(64),
  verifactuEstado: 'REGISTRADA' as string | null,
};
const NIF = 'B00000000';
const PROD = { produccion: true };

test('con registro admitido por la AEAT y en producción, hay sello', () => {
  const sello = selloParaCliente(SELLADA, NIF, PROD);
  assert.ok(sello);
  assert.equal(sello.leyenda, LEYENDA_VERIFACTU);
  assert.match(sello.url, /^https:\/\/www2\.agenciatributaria\.es\//);
  assert.match(sello.url, /nif=B00000000/);
  assert.match(sello.url, /fecha=01-08-2026/);
  assert.match(sello.url, /importe=100\.00/);
});

test('ACEPTADA_CON_ERRORES también coteja: la AEAT la tiene', () => {
  assert.ok(selloParaCliente({ ...SELLADA, verifactuEstado: 'ACEPTADA_CON_ERRORES' }, NIF, PROD));
});

// ── Las cinco puertas que dejan la factura SIN sello ─────────────────────────
// Ninguna es un error: son estados normales. Una factura sin QR es una factura
// correcta; una factura con un QR que no coteja es una factura que parece falsa.

test('sin huella no hay sello: no es una factura Veri*Factu', () => {
  assert.equal(selloParaCliente({ ...SELLADA, verifactuHash: null }, NIF, PROD), null);
});

test('en entorno de pruebas NO hay sello, aunque esté sellada y admitida', () => {
  // El QR apuntaría a prewww2.aeat.es, que no coteja la factura de nadie.
  assert.equal(selloParaCliente(SELLADA, NIF, { produccion: false }), null);
});

test('PENDIENTE de transmitir no lleva sello: la AEAT todavía no la tiene', () => {
  assert.equal(selloParaCliente({ ...SELLADA, verifactuEstado: 'PENDIENTE' }, NIF, PROD), null);
});

test('RECHAZADA por la AEAT no lleva sello', () => {
  assert.equal(selloParaCliente({ ...SELLADA, verifactuEstado: 'RECHAZADA' }, NIF, PROD), null);
});

test('estado nulo (fuera de la cola de transmisión) no lleva sello', () => {
  // Las 27 facturas históricas de producción están así: se sellaron antes de
  // que existiera la cola, y nadie las va a transmitir.
  assert.equal(selloParaCliente({ ...SELLADA, verifactuEstado: null }, NIF, PROD), null);
});

test('sin NIF del emisor no se puede construir la URL de cotejo', () => {
  assert.equal(selloParaCliente(SELLADA, '', PROD), null);
});

test('el estado real de producción hoy: ninguna factura lleva sello', () => {
  // 36 facturas emitidas, 32 selladas, 0 admitidas por la AEAT (27 fuera de la
  // cola, 9 PENDIENTE) — comprobado en producción el 9-sep-2026. Este test
  // documenta por qué la alumna no ve ningún QR: no hay nada que cotejar.
  const produccionHoy = [null, 'PENDIENTE'];
  for (const estado of produccionHoy) {
    assert.equal(selloParaCliente({ ...SELLADA, verifactuEstado: estado }, NIF, PROD), null);
  }
});
