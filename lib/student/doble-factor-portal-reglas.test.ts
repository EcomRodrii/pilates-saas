import test from 'node:test';
import assert from 'node:assert/strict';
import { decidirPasoPortal, destinoTrasDosPasos } from './doble-factor-portal-reglas.ts';

test('sin la verificación activada, la app ni pregunta: nada cambia para esa alumna', () => {
  assert.equal(decidirPasoPortal({ actual: 'aal1', siguiente: 'aal1', yaConfiada: false }), 'ok');
  assert.equal(decidirPasoPortal({ actual: null, siguiente: null, yaConfiada: false }), 'ok');
});

test('con ella activada: aal2 entra, confiada entra, y si no se pregunta al servidor', () => {
  assert.equal(decidirPasoPortal({ actual: 'aal2', siguiente: 'aal2', yaConfiada: false }), 'ok');
  assert.equal(decidirPasoPortal({ actual: 'aal1', siguiente: 'aal2', yaConfiada: true }), 'ok');
  assert.equal(decidirPasoPortal({ actual: 'aal1', siguiente: 'aal2', yaConfiada: false }), 'preguntar');
});

test('volver tras el segundo paso: solo a la app de este estudio o a su página de reservas', () => {
  assert.equal(destinoTrasDosPasos('/portal/casa/bonos', 'casa'), '/portal/casa/bonos');
  assert.equal(destinoTrasDosPasos('/portal/casa/reservar?dia=2', 'casa'), '/portal/casa/reservar?dia=2');
  assert.equal(destinoTrasDosPasos('/portal/casa', 'casa'), '/portal/casa');
  assert.equal(destinoTrasDosPasos('/reservar/casa?clase=1', 'casa'), '/reservar/casa?clase=1');
  assert.equal(destinoTrasDosPasos(null, 'casa'), '/portal/casa');
  for (const malo of ['/portal/otro/bonos', '/portal/casaotra', 'https://malo.example.com', '//malo.example.com', '/\\malo.example.com',
    '/dashboard', '/reservar/otro', '/reservar/casaotra', '/portal/casa/acceso/dos-pasos?next=/x', '/portal/casa/acceso/dos-pasos', `/portal/casa/\tx`]) {
    assert.equal(destinoTrasDosPasos(malo, 'casa'), '/portal/casa', malo);
  }
});
