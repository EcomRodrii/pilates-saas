import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esDireccionDelPaso } from './guia.ts';

const BASE = 'https://tentare.app/configuracion?tab=reservas';

test('el paso solo deja su pantalla: otra ruta, otra pestaña u otro sitio se bloquean', () => {
  const ruta = '/configuracion?tab=reservas';
  assert.equal(esDireccionDelPaso('/configuracion?tab=reservas', ruta, BASE), true);
  assert.equal(esDireccionDelPaso('/configuracion?tab=reservas&x=1', ruta, BASE), true, 'un parámetro de más no cambia de pantalla');
  assert.equal(esDireccionDelPaso('/configuracion?tab=pagos', ruta, BASE), false, 'otra pestaña de Configuración es otro módulo');
  assert.equal(esDireccionDelPaso('/configuracion', ruta, BASE), false);
  assert.equal(esDireccionDelPaso('/calendario', ruta, BASE), false);
  assert.equal(esDireccionDelPaso('https://otro.example/configuracion?tab=reservas', ruta, BASE), false);
  assert.equal(esDireccionDelPaso('/clientas/soc-1#bonos', '/clientas/soc-1', 'https://tentare.app/clientas/soc-1'), true);
});
