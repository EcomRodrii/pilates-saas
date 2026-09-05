import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loteAEnviar, hayHuecoAntesDe, casarRespuestas, estadoDesdeRespuesta, yaNoSeReenvia,
  type FacturaPendiente,
} from './pendientes.ts';

const f = (seq: number, numero: string): FacturaPendiente => ({
  id: `fac-${seq}`, studioId: 'studio-1', numeroCompleto: numero,
  fechaExpedicion: '05-09-2026', verifactuSeq: seq,
  huella: 'A'.repeat(64), huellaAnterior: 'B'.repeat(64),
});

// El orden es la cadena. Mandar la 7 antes que la 6 le da a la AEAT una
// secuencia que no cuadra.
test('el lote va ordenado por secuencia, no por el orden en que llegaron', () => {
  const lote = loteAEnviar([f(3, 'A-3'), f(1, 'A-1'), f(2, 'A-2')]);
  assert.deepEqual(lote.map(x => x.verifactuSeq), [1, 2, 3]);
});

test('el lote se corta al tamaño pedido, quedándose con las primeras', () => {
  const lote = loteAEnviar([f(5, 'A-5'), f(1, 'A-1'), f(3, 'A-3')], 2);
  assert.deepEqual(lote.map(x => x.verifactuSeq), [1, 3]);
});

test('la primera factura de todas no tiene hueco delante', () => {
  assert.equal(hayHuecoAntesDe([f(1, 'A-1')], null), false);
});

test('si la anterior nunca se envió, hay hueco y no se manda', () => {
  // Falta la 7: la 8 declararía como anterior una huella que la AEAT no tiene.
  assert.equal(hayHuecoAntesDe([f(8, 'A-8')], 6), true);
  assert.equal(hayHuecoAntesDe([f(8, 'A-8')], 7), false);
});

test('sin nada registrado todavía, solo se puede empezar por la primera', () => {
  assert.equal(hayHuecoAntesDe([f(2, 'A-2')], null), true);
});

// Lo que más daño hace: emparejar por posición. La AEAT no garantiza el orden.
test('las respuestas se casan por número de factura, nunca por posición', () => {
  const enviadas = [f(1, 'A-1'), f(2, 'A-2')];
  const res = casarRespuestas(enviadas, [
    { numSerieFactura: 'A-2', estado: 'Incorrecto', codigoError: '1100', descripcionError: 'Duplicada' },
    { numSerieFactura: 'A-1', estado: 'Correcto', codigoError: null, descripcionError: null },
  ]);
  const porNumero = Object.fromEntries(res.map(r => [r.factura.numeroCompleto, r]));
  assert.equal(porNumero['A-1'].estado, 'REGISTRADA');
  assert.equal(porNumero['A-2'].estado, 'RECHAZADA');
  assert.match(porNumero['A-2'].error ?? '', /1100/);
});

test('una factura sin respuesta se queda pendiente, no se da por buena', () => {
  const res = casarRespuestas([f(1, 'A-1')], []);
  assert.equal(res[0].estado, 'PENDIENTE');
  assert.equal(res[0].error, null);
});

test('aceptada con errores queda registrada y no se reenvía', () => {
  assert.equal(estadoDesdeRespuesta({ numSerieFactura: 'A-1', estado: 'AceptadoConErrores', codigoError: '2000', descripcionError: null }), 'ACEPTADA_CON_ERRORES');
  assert.ok(yaNoSeReenvia('ACEPTADA_CON_ERRORES'));
  assert.ok(yaNoSeReenvia('REGISTRADA'));
  assert.ok(!yaNoSeReenvia('RECHAZADA'));
  assert.ok(!yaNoSeReenvia('PENDIENTE'));
});

test('un estado que no se entiende deja la factura pendiente', () => {
  assert.equal(estadoDesdeRespuesta({ numSerieFactura: 'A-1', estado: null, codigoError: null, descripcionError: null }), 'PENDIENTE');
});

test('el error guardado lleva código y descripción juntos', () => {
  const res = casarRespuestas([f(1, 'A-1')], [
    { numSerieFactura: 'A-1', estado: 'Incorrecto', codigoError: '1141', descripcionError: 'NIF no identificado' },
  ]);
  assert.equal(res[0].error, '1141 · NIF no identificado');
});
