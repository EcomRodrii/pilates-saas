// La declaración responsable tiene que estar «accesible por el usuario de forma
// rápida, fácil e intuitiva» dentro del sistema (Orden HAC/1177/2024, art. 15.3):
// la ve todo el personal que usa el panel de facturación.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { puedeVer } from '../permisos-reglas.ts';

test('la página existe dentro del panel', () => {
  assert.ok(existsSync('app/(dashboard)/verifactu/declaracion-responsable/page.tsx'));
  assert.ok(existsSync('app/api/verifactu/declaracion-responsable/route.ts'));
});

test('la ven propietaria, gerencia y recepción; la instructora no usa el panel', () => {
  const ruta = '/verifactu/declaracion-responsable';
  assert.equal(puedeVer('PROPIETARIO', ruta), true);
  assert.equal(puedeVer('MANAGER', ruta), true);
  assert.equal(puedeVer('RECEPCION', ruta), true);
  assert.equal(puedeVer('INSTRUCTOR', ruta), false);
});
