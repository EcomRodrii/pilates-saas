import { test } from 'node:test';
import assert from 'node:assert/strict';
import { columnasDeCambio, leerCambio, ordenCola } from './apps-estudio.ts';

test('hay que decir qué estudio y cambiar algo', () => {
  assert.equal(leerCambio(null).ok, false);
  assert.equal(leerCambio({}).ok, false);
  assert.equal(leerCambio({ studioId: 's1' }).ok, false);
  assert.equal(leerCambio({ studioId: 's1', estado: 'EN_PRUEBAS' }).ok, true);
});

test('el estado y activa tienen que ser de verdad', () => {
  assert.equal(leerCambio({ studioId: 's1', estado: 'pedida' }).ok, false);
  assert.equal(leerCambio({ studioId: 's1', estado: 'OTRO' }).ok, false);
  assert.equal(leerCambio({ studioId: 's1', activa: 'si' }).ok, false);
  assert.deepEqual(leerCambio({ studioId: 's1', activa: true }), { ok: true, cambio: { studioId: 's1', activa: true } });
});

test('Publicada exige el enlace de la App Store, ya puesto o en el mismo cambio', () => {
  assert.equal(leerCambio({ studioId: 's1', estado: 'PUBLICADA' }).ok, false);
  assert.equal(leerCambio({ studioId: 's1', estado: 'PUBLICADA' }, 'https://apps.apple.com/es/app/x/id1').ok, true);
  assert.equal(leerCambio({ studioId: 's1', estado: 'PUBLICADA', urlTienda: 'https://apps.apple.com/es/app/x/id1' }).ok, true);
  // Y no vale quitar el enlace al mismo tiempo que se publica.
  assert.equal(leerCambio({ studioId: 's1', estado: 'PUBLICADA', urlTienda: null }, 'https://apps.apple.com/es/app/x/id1').ok, false);
});

test('el enlace tiene que ser de apps.apple.com', () => {
  assert.equal(leerCambio({ studioId: 's1', urlTienda: 'https://evil.example/x' }).ok, false);
  assert.equal(leerCambio({ studioId: 's1', urlTienda: 'javascript:alert(1)' }).ok, false);
  assert.deepEqual(leerCambio({ studioId: 's1', urlTienda: '' }), { ok: true, cambio: { studioId: 's1', urlTienda: null } });
});

test('la nota se recorta, se vacía a null y tiene tope', () => {
  assert.deepEqual(leerCambio({ studioId: 's1', notaInterna: '  hola  ' }), { ok: true, cambio: { studioId: 's1', notaInterna: 'hola' } });
  assert.deepEqual(leerCambio({ studioId: 's1', notaInterna: '   ' }), { ok: true, cambio: { studioId: 's1', notaInterna: null } });
  assert.equal(leerCambio({ studioId: 's1', notaInterna: 'x'.repeat(2001) }).ok, false);
});

test('solo se escriben las columnas que cambian', () => {
  assert.deepEqual(columnasDeCambio({ studioId: 's1', estado: 'EN_PREPARACION' }), { estado: 'EN_PREPARACION' });
  assert.deepEqual(columnasDeCambio({ studioId: 's1', activa: false, urlTienda: null }), { activa: false, url_tienda: null });
  // El estudio no se cuela entre las columnas.
  assert.equal('studio_id' in columnasDeCambio({ studioId: 's1', estado: 'PEDIDA' }), false);
});

test('la cola pone antes lo pedido y sin tramitar, y lo más antiguo primero', () => {
  const lista = [
    { id: 'pub', estado: 'PUBLICADA' as const, pedidaEn: '2026-10-01' },
    { id: 'nueva', estado: 'PEDIDA' as const, pedidaEn: '2026-10-15' },
    { id: 'vieja', estado: 'PEDIDA' as const, pedidaEn: '2026-10-10' },
    { id: 'rev', estado: 'EN_REVISION' as const, pedidaEn: '2026-10-05' },
  ].sort(ordenCola).map((x) => x.id);
  assert.deepEqual(lista, ['vieja', 'nueva', 'rev', 'pub']);
});
