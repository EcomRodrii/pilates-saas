import test from 'node:test';
import assert from 'node:assert/strict';
import { hostAutorizado } from './host-autorizado.ts';

test('fuera de producción, cualquier host pasa — no bloquea preview/local', () => {
  assert.equal(hostAutorizado(null, { esProduccion: false, hostEsperado: 'imports.tentare.app' }), true);
  assert.equal(hostAutorizado('cualquier-cosa.vercel.app', { esProduccion: false, hostEsperado: 'imports.tentare.app' }), true);
});

test('⚠️ en producción, sin NEXT_PUBLIC_IMPORTS_HOST configurado, cierra por defecto — nunca abierto', () => {
  assert.equal(hostAutorizado('imports.tentare.app', { esProduccion: true, hostEsperado: undefined }), false);
});

test('en producción, el host correcto pasa', () => {
  assert.equal(hostAutorizado('imports.tentare.app', { esProduccion: true, hostEsperado: 'imports.tentare.app' }), true);
});

test('⚠️ en producción, el dominio del panel (tentare.app) NO puede servir el tema — esta es la cerradura real', () => {
  assert.equal(hostAutorizado('www.tentare.app', { esProduccion: true, hostEsperado: 'imports.tentare.app' }), false);
  assert.equal(hostAutorizado('tentare.app', { esProduccion: true, hostEsperado: 'imports.tentare.app' }), false);
});

test('en producción, cualquier otro host se rechaza', () => {
  assert.equal(hostAutorizado('evil.example.com', { esProduccion: true, hostEsperado: 'imports.tentare.app' }), false);
  assert.equal(hostAutorizado(null, { esProduccion: true, hostEsperado: 'imports.tentare.app' }), false);
});
