import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puedeGestionarCalendario, puedeVer } from '../permisos-reglas.ts';

// «Plazas libres» (P3.9): la pantalla hereda el permiso del Calendario por
// prefijo, y su endpoint pide `puedeGestionarCalendario`. Los dos tienen que
// decir lo mismo para cada rol, o un rol vería una pantalla que no le contesta.
test('plazas libres: propietaria, gerencia y recepción sí; la instructora, no (ni pantalla ni datos)', () => {
  for (const rol of ['PROPIETARIO', 'MANAGER', 'RECEPCION'] as const) {
    assert.equal(puedeVer(rol, '/calendario/plazas-libres'), true, rol);
    assert.equal(puedeGestionarCalendario(rol), true, rol);
  }
  assert.equal(puedeVer('INSTRUCTOR', '/calendario/plazas-libres'), false);
  assert.equal(puedeGestionarCalendario('INSTRUCTOR'), false);
});
