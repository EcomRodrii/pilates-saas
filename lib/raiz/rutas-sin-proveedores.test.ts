import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esAppDeLaAlumna, sinProveedoresDeSesion } from './rutas-sin-proveedores.ts';

test('la app de la alumna se sirve sin los providers del panel', () => {
  for (const ruta of ['/portal/mi-estudio', '/portal/mi-estudio/reservar', '/portal/mi-estudio/perfil/privacidad', '/portal/offline']) {
    assert.equal(esAppDeLaAlumna(ruta), true, ruta);
  }
});

test('todo lo demás los conserva — incluidas las rutas que solo se parecen', () => {
  for (const ruta of [
    '/', '/dashboard', '/login', '/precios',
    // `/reservar/` necesita `AuthProvider` encima de su propio StudioProvider.
    '/reservar/mi-estudio',
    // Empiezan por «/portal» pero no son la app de la alumna.
    '/portal', '/portal-preview', '/portal-prototipo/mi-estudio',
  ]) {
    assert.equal(esAppDeLaAlumna(ruta), false, ruta);
  }
});

test('sin ruta resuelta, se montan (lo que había)', () => {
  assert.equal(esAppDeLaAlumna(null), false);
  assert.equal(esAppDeLaAlumna(undefined), false);
});

test('la ventana del puente del widget, sin providers (no carga el cliente del portal); el resto, igual', () => {
  assert.equal(sinProveedoresDeSesion('/widget-auth-retorno'), true);
  assert.equal(sinProveedoresDeSesion('/portal/mi-estudio'), true);
  for (const ruta of ['/widget-auth-retorno/x', '/widget-auth-retorno-x', '/reservar/mi-estudio', '/login', '/', null, undefined]) {
    assert.equal(sinProveedoresDeSesion(ruta), false, String(ruta));
  }
});
