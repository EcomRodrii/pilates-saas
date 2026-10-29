import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esDireccionDelPaso } from './guia.ts';

const BASE = 'https://tentare.app/configuracion?tab=reservas';

test('el paso solo deja su pantalla: otra ruta, otra pestaña u otro sitio se bloquean', () => {
  const ruta = '/clientas/soc-1?pestana=bonos';
  assert.equal(esDireccionDelPaso('/clientas/soc-1?pestana=bonos', ruta, BASE), true);
  assert.equal(esDireccionDelPaso('/clientas/soc-1?pestana=bonos&x=1', ruta, BASE), true, 'un parámetro de más no cambia de pantalla');
  assert.equal(esDireccionDelPaso('/clientas/soc-1?pestana=pagos', ruta, BASE), false, 'otra pestaña es otro módulo');
  assert.equal(esDireccionDelPaso('/clientas/soc-1', ruta, BASE), false);
  assert.equal(esDireccionDelPaso('/calendario', ruta, BASE), false);
  assert.equal(esDireccionDelPaso('https://otro.example/clientas/soc-1?pestana=bonos', ruta, BASE), false);
  assert.equal(esDireccionDelPaso('/clientas/soc-1#bonos', '/clientas/soc-1', 'https://tentare.app/clientas/soc-1'), true);
});
