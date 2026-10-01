import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLUMNAS_EVENTO, codificarCursorEventos, decodificarCursorEventos, eventoPublico, serializarRecurso } from './evento.ts';
import { RECURSOS_EVENTO } from './catalogo.ts';
import { ESQUEMAS } from '../openapi.ts';
import { clientaPublica, devolucionPublica, facturaPublica, reciboPublico, ventaPublica } from '../serializar.ts';

const fila = { id: 'evt_1', tipo: 'recibo.creado', recurso: 'recibo', recurso_id: 'rec-1', studio_id: 'std-1', creado_en: '2026-10-01T10:00:00Z', datos: { id: 'rec-1' }, procesado_en: 'x', reclamado_hasta: null, seq: 7, publicado: 9 };

test('un evento devuelve exactamente lo que dice la especificación OpenAPI', () => {
  const props = Object.keys((ESQUEMAS.Evento as { properties: Record<string, unknown> }).properties).sort();
  assert.deepEqual(Object.keys(eventoPublico(fila)).sort(), props);
});

test('las columnas internas del registro no salen', () => {
  const json = JSON.stringify(eventoPublico(fila));
  for (const k of ['procesado_en', 'reclamado_hasta', 'seq', 'publicado', 'studio_id', 'recurso_id']) assert.ok(!json.includes(`"${k}"`), k);
});

test('datos es la misma forma que el endpoint del recurso (clienta, sin datos fiscales)', () => {
  const f = { id: 'x', studio_id: 's', nif: '00000000T', direccion: 'Calle', nombre: 'N', importe: '10', estado: 'COBRADO', ventas_pos_lineas: [] };
  assert.deepEqual(serializarRecurso('recibo', f), reciboPublico(f));
  assert.deepEqual(serializarRecurso('factura', f), facturaPublica(f));
  assert.deepEqual(serializarRecurso('devolucion', f), devolucionPublica(f));
  assert.deepEqual(serializarRecurso('venta', f), ventaPublica(f));
  const clienta = serializarRecurso('clienta', f);
  assert.deepEqual(clienta, clientaPublica(f, false));
  assert.ok(!JSON.stringify(clienta).includes('00000000T'), 'el NIF no viaja en un evento');
});

test('cada recurso lee también studio_id, para comprobar que la fila es del estudio del evento', () => {
  for (const r of RECURSOS_EVENTO) assert.match(COLUMNAS_EVENTO[r], /\bstudio_id\b/);
  assert.doesNotMatch(COLUMNAS_EVENTO.clienta, /\bnif\b|\bdireccion\b/);
});

test('cursor del registro: ida y vuelta, y rechaza lo manipulado', () => {
  assert.equal(decodificarCursorEventos(codificarCursorEventos(123456)), 123456);
  assert.equal(decodificarCursorEventos(null), null);
  assert.equal(decodificarCursorEventos(''), null);
  for (const malo of ['abc', Buffer.from('e:-1').toString('base64url'), Buffer.from('e:1 or 1=1').toString('base64url'), 'x'.repeat(50)]) {
    assert.equal(decodificarCursorEventos(malo), 'invalido', malo);
  }
});
