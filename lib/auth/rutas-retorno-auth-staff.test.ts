import test from 'node:test';
import assert from 'node:assert/strict';
import { esRetornoAuthStaff } from './rutas-retorno-auth-staff.ts';

test('las vueltas de los enlaces del equipo', () => {
  for (const ruta of ['/login', '/clave-nueva', '/network/acceso']) {
    assert.equal(esRetornoAuthStaff(ruta), true, ruta);
  }
});

test('las vueltas de los enlaces de la socia NO lo son', () => {
  // Si alguna de estas entrara en la lista, el cliente del portal dejaría de
  // recoger el enlace mágico de la socia en esa ruta, y el de staff empezaría a
  // hacerlo — el hallazgo #9 de la auditoría del 30-jul, al revés.
  for (const ruta of ['/portal/estudio/acceso/verificar', '/reservar/estudio', '/widget-auth-retorno']) {
    assert.equal(esRetornoAuthStaff(ruta), false, ruta);
  }
});

test('sin ruta (servidor), no', () => {
  assert.equal(esRetornoAuthStaff(undefined), false);
  assert.equal(esRetornoAuthStaff(null), false);
  assert.equal(esRetornoAuthStaff(''), false);
});

test('solo la ruta exacta, no lo que cuelga de ella', () => {
  assert.equal(esRetornoAuthStaff('/login/otra'), false);
  assert.equal(esRetornoAuthStaff('/clave-nueva/'), false);
});
