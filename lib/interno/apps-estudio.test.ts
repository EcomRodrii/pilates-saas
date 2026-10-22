import { test } from 'node:test';
import assert from 'node:assert/strict';
import { columnasDeCambio, leerCambio, ordenCola, transicionPermitida, type AppActual } from './apps-estudio.ts';

const URL_OK = 'https://apps.apple.com/es/app/x/id6822491721';
const pedida: AppActual = { estado: 'PEDIDA', activa: false, urlTienda: null };
const enPruebas: AppActual = { estado: 'EN_PRUEBAS', activa: true, urlTienda: null };
const publicada: AppActual = { estado: 'PUBLICADA', activa: true, urlTienda: URL_OK };

test('hay que decir qué estudio y cambiar algo', () => {
  assert.equal(leerCambio(null, pedida).ok, false);
  assert.equal(leerCambio({}, pedida).ok, false);
  assert.equal(leerCambio({ studioId: 's1' }, pedida).ok, false);
  assert.equal(leerCambio({ studioId: 's1', estado: 'EN_PREPARACION' }, pedida).ok, true);
});

test('el estado y activa tienen que ser de verdad', () => {
  assert.equal(leerCambio({ studioId: 's1', estado: 'pedida' }, pedida).ok, false);
  assert.equal(leerCambio({ studioId: 's1', estado: 'OTRO' }, pedida).ok, false);
  assert.equal(leerCambio({ studioId: 's1', activa: 'si' }, enPruebas).ok, false);
  assert.deepEqual(leerCambio({ studioId: 's1', activa: false }, enPruebas), { ok: true, cambio: { studioId: 's1', activa: false } });
});

test('transiciones: hacia delante sí, hacia atrás solo lo que pasa de verdad', () => {
  assert.equal(transicionPermitida('PEDIDA', 'EN_PRUEBAS'), true);
  assert.equal(transicionPermitida('EN_REVISION', 'EN_PRUEBAS'), true, 'Apple la rechaza');
  assert.equal(transicionPermitida('EN_PRUEBAS', 'EN_PREPARACION'), true, 'se rehace la compilación');
  assert.equal(transicionPermitida('EN_REVISION', 'PEDIDA'), false);
  assert.equal(transicionPermitida('PUBLICADA', 'PEDIDA'), false);
  assert.equal(transicionPermitida('PUBLICADA', 'EN_REVISION'), false);
  assert.equal(transicionPermitida('PUBLICADA', 'PAUSADA'), true);
  assert.equal(transicionPermitida('PAUSADA', 'PUBLICADA'), true);
  assert.equal(transicionPermitida('PAUSADA', 'PEDIDA'), false);
  assert.equal(leerCambio({ studioId: 's1', estado: 'PEDIDA' }, publicada).ok, false);
});

test('Publicada exige el enlace y la app activa, mirando cómo queda después del cambio', () => {
  const lista: AppActual = { estado: 'EN_REVISION', activa: true, urlTienda: null };
  assert.equal(leerCambio({ studioId: 's1', estado: 'PUBLICADA' }, lista).ok, false);
  assert.equal(leerCambio({ studioId: 's1', estado: 'PUBLICADA', urlTienda: URL_OK }, lista).ok, true);
  assert.equal(leerCambio({ studioId: 's1', estado: 'PUBLICADA' }, { ...lista, urlTienda: URL_OK }).ok, true);
  // Quitar el enlace de una publicada, aunque no se toque el estado: no.
  assert.equal(leerCambio({ studioId: 's1', urlTienda: null }, publicada).ok, false);
  assert.equal(leerCambio({ studioId: 's1', urlTienda: '' }, publicada).ok, false);
  // Desactivar una publicada: no (la app instalada dejaría de abrir su estudio).
  assert.equal(leerCambio({ studioId: 's1', activa: false }, publicada).ok, false);
  // Publicar sin activar: no.
  assert.equal(leerCambio({ studioId: 's1', estado: 'PUBLICADA', urlTienda: URL_OK }, { ...lista, activa: false }).ok, false);
});

test('no se activa una app que aún no existe en App Store Connect', () => {
  assert.equal(leerCambio({ studioId: 's1', activa: true }, pedida).ok, false);
  assert.equal(leerCambio({ studioId: 's1', activa: true, estado: 'EN_PREPARACION' }, pedida).ok, true);
});

test('el enlace tiene que ser el de la ficha de una app en apps.apple.com', () => {
  assert.equal(leerCambio({ studioId: 's1', urlTienda: 'https://evil.example/x' }, enPruebas).ok, false);
  assert.equal(leerCambio({ studioId: 's1', urlTienda: 'javascript:alert(1)' }, enPruebas).ok, false);
  assert.equal(leerCambio({ studioId: 's1', urlTienda: 'https://apps.apple.com/a' }, enPruebas).ok, false);
  assert.deepEqual(leerCambio({ studioId: 's1', urlTienda: '' }, enPruebas), { ok: true, cambio: { studioId: 's1', urlTienda: null } });
});

test('la nota se recorta, se vacía a null y tiene tope', () => {
  assert.deepEqual(leerCambio({ studioId: 's1', notaInterna: '  hola  ' }, pedida), { ok: true, cambio: { studioId: 's1', notaInterna: 'hola' } });
  assert.deepEqual(leerCambio({ studioId: 's1', notaInterna: '   ' }, pedida), { ok: true, cambio: { studioId: 's1', notaInterna: null } });
  assert.equal(leerCambio({ studioId: 's1', notaInterna: 'x'.repeat(2001) }, pedida).ok, false);
});

test('el nombre de la app se cambia con las mismas reglas que al pedirla', () => {
  assert.deepEqual(leerCambio({ studioId: 's1', nombreApp: '  Luz   Pilates ' }, pedida), { ok: true, cambio: { studioId: 's1', nombreApp: 'Luz Pilates' } });
  assert.equal(leerCambio({ studioId: 's1', nombreApp: 'x'.repeat(31) }, pedida).ok, false);
  assert.equal(leerCambio({ studioId: 's1', nombreApp: 'Luz$' }, pedida).ok, false);
});

test('solo se escriben las columnas que cambian', () => {
  assert.deepEqual(columnasDeCambio({ studioId: 's1', estado: 'EN_PREPARACION' }), { estado: 'EN_PREPARACION' });
  assert.deepEqual(columnasDeCambio({ studioId: 's1', activa: false, urlTienda: null }), { activa: false, url_tienda: null });
  assert.deepEqual(columnasDeCambio({ studioId: 's1', nombreApp: 'Luz' }), { nombre_app: 'Luz' });
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
