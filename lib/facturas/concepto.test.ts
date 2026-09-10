import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  conceptoDeFactura, descripcionAeatDeFactura,
  CONCEPTO_GENERICO, DESCRIPCION_AEAT_GENERICA, MAX_DESCRIPCION_AEAT,
} from './concepto.ts';

// El caso que motivó todo: una factura de un bono decía lo mismo que una cuota.
test('el concepto guardado es el que se pinta', () => {
  assert.equal(conceptoDeFactura({ concepto: 'Bono 10 clases' }), 'Bono 10 clases');
  assert.equal(conceptoDeFactura({ concepto: 'Cuota mensual' }), 'Cuota mensual');
});

// ⚠️ Las 40 facturas de producción no tienen concepto y NO se rellenan: siguen
// pintando lo de siempre. Es lo que hace que este cambio no toque nada sellado.
test('sin concepto (factura anterior al cambio) cae al genérico', () => {
  assert.equal(conceptoDeFactura({ concepto: null }), CONCEPTO_GENERICO);
  assert.equal(conceptoDeFactura({}), CONCEPTO_GENERICO);
});

test('un concepto en blanco no imprime un hueco', () => {
  assert.equal(conceptoDeFactura({ concepto: '   ' }), CONCEPTO_GENERICO);
  assert.equal(conceptoDeFactura({ concepto: '' }), CONCEPTO_GENERICO);
});

test('se recorta el espacio de los lados, no el de dentro', () => {
  assert.equal(conceptoDeFactura({ concepto: '  Bono 10 clases  ' }), 'Bono 10 clases');
});

// ─── AEAT ───────────────────────────────────────────────────────────────────

test('a la AEAT va el concepto real cuando lo hay', () => {
  assert.equal(descripcionAeatDeFactura({ concepto: 'Bono 10 clases' }), 'Bono 10 clases');
});

// Las que están en la cola AHORA se sellaron sin concepto: a Hacienda le sigue
// llegando la descripción que le correspondía a esa operación, no una inventada.
test('sin concepto, a la AEAT le llega la descripción de siempre', () => {
  assert.equal(descripcionAeatDeFactura({ concepto: null }), DESCRIPCION_AEAT_GENERICA);
  assert.equal(descripcionAeatDeFactura({ concepto: '  ' }), DESCRIPCION_AEAT_GENERICA);
});

// Un registro RECHAZADO congela toda la cadena posterior del estudio, así que
// pasarse del tope del XSD no es un detalle cosmético.
test('se acota al tope del XSD, y sin añadir puntos suspensivos', () => {
  const largo = 'B'.repeat(MAX_DESCRIPCION_AEAT + 50);
  const r = descripcionAeatDeFactura({ concepto: largo });
  assert.equal(r.length, MAX_DESCRIPCION_AEAT);
  assert.equal(r, 'B'.repeat(MAX_DESCRIPCION_AEAT));
  assert.ok(!r.includes('…'), 'no se inventa un carácter en un registro fiscal');
});

test('justo en el tope no se toca', () => {
  const justo = 'C'.repeat(MAX_DESCRIPCION_AEAT);
  assert.equal(descripcionAeatDeFactura({ concepto: justo }), justo);
});

// Lo que se PINTA no se acota: el papel de la clienta no tiene el límite del XSD.
test('lo que se pinta no hereda el tope de la AEAT', () => {
  const largo = 'D'.repeat(MAX_DESCRIPCION_AEAT + 50);
  assert.equal(conceptoDeFactura({ concepto: largo }), largo);
});

// ─── Rectificativas ─────────────────────────────────────────────────────────
//
// Una rectificativa se sella desde la factura ORIGINAL, no desde un recibo, así
// que hereda su concepto: corrige una operación concreta y tiene que decir cuál.
// Que sea una rectificativa ya lo dice el documento por su tipo (R1-R5), su
// serie (R) y su `rectifica_a` — el concepto no repite eso.

test('la rectificativa hereda el concepto de la factura que corrige', () => {
  const original = { concepto: 'Bono 10 clases' };
  const rectificativa = { concepto: original.concepto };
  assert.equal(conceptoDeFactura(rectificativa), 'Bono 10 clases');
  assert.equal(descripcionAeatDeFactura(rectificativa), 'Bono 10 clases');
});

// Si la original es de las 40 anteriores al cambio, no tiene concepto: la
// rectificativa cae al genérico igual que ella. Las dos dicen lo mismo, que es
// lo correcto — una rectificativa no puede describir mejor que su original.
test('rectificar una factura antigua deja las dos en el genérico', () => {
  const original = { concepto: null };
  const rectificativa = { concepto: original.concepto };
  assert.equal(conceptoDeFactura(rectificativa), conceptoDeFactura(original));
  assert.equal(descripcionAeatDeFactura(rectificativa), descripcionAeatDeFactura(original));
});
