import { test } from 'node:test';
import assert from 'node:assert/strict';
import { destinoDeEnlace } from './destino-enlace.ts';

const AQUI = 'https://www.tentare.app/portal/zen';

test('otro dominio, aunque no pida ventana nueva, va fuera (Safari por encima)', () => {
  assert.deepEqual(destinoDeEnlace('https://maps.apple.com/?q=x', AQUI, false), { tipo: 'fuera', url: 'https://maps.apple.com/?q=x' });
  assert.deepEqual(destinoDeEnlace('https://instagram.com/zen', AQUI, true), { tipo: 'fuera', url: 'https://instagram.com/zen' });
});

test('nuestra web con ventana nueva se abre dentro; sin ella, la lleva Next', () => {
  assert.deepEqual(destinoDeEnlace('/privacidad', AQUI, true), { tipo: 'interna', ruta: '/privacidad' });
  assert.deepEqual(destinoDeEnlace('/reservar/zen?tab=citas', AQUI, true), { tipo: 'interna', ruta: '/reservar/zen?tab=citas' });
  assert.equal(destinoDeEnlace('/portal/zen/clases', AQUI, false), null);
});

test('tel, mailto, anclas, javascript o nada: no se tocan', () => {
  for (const h of ['tel:+34600000000', 'mailto:hola@example.com', 'javascript:void(0)', '', null, undefined]) {
    assert.equal(destinoDeEnlace(h as string, AQUI, true), null, String(h));
  }
});
