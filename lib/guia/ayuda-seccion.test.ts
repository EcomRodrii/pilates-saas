import { test } from 'node:test';
import assert from 'node:assert/strict';

import { seccionConAyuda, CIERRES_PARA_OCULTAR_TODAS } from './ayuda-seccion.ts';

test('sale en una sección del mapa, también en sus subrutas', () => {
  assert.equal(seccionConAyuda('/cobros', []), '/cobros');
  assert.equal(seccionConAyuda('/clientas/abc-123', []), '/clientas');
});

test('no sale fuera del mapa', () => {
  assert.equal(seccionConAyuda('/dashboard', []), null);
  // Prefijo sin barra: `/cobrosX` no es Cobros.
  assert.equal(seccionConAyuda('/cobrosX', []), null);
});

test('cerrada en una sección, sigue saliendo en las demás', () => {
  assert.equal(seccionConAyuda('/cobros', ['/cobros']), null);
  assert.equal(seccionConAyuda('/calendario', ['/cobros']), '/calendario');
});

test('a partir de dos cierres deja de salir en todas', () => {
  assert.equal(CIERRES_PARA_OCULTAR_TODAS, 2);
  const cerradas = ['/cobros', '/calendario'];
  for (const ruta of ['/clientas', '/equipo', '/informes', '/migracion']) {
    assert.equal(seccionConAyuda(ruta, cerradas), null, ruta);
  }
});

test('un cierre repetido de la misma sección no cuenta dos veces', () => {
  assert.equal(seccionConAyuda('/calendario', ['/cobros', '/cobros']), '/calendario');
});
