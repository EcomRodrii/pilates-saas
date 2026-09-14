import { test } from 'node:test';
import assert from 'node:assert/strict';
import { destinoInstructoraEnPanel, urlAppInstructora } from './app-instructora.ts';

const INSTRUCTORA_AQUI = { id: 'sede-a', rol: 'INSTRUCTOR' };

test('el enlace lleva a «Hoy» de la app de su estudio', () => {
  assert.equal(urlAppInstructora('pilates-centro'), '/portal/pilates-centro/equipo');
  assert.equal(urlAppInstructora('con espacio'), '/portal/con%20espacio/equipo');
});

test('una instructora confirmada, sin otra sede que gestione, va directa a la app', () => {
  assert.equal(destinoInstructoraEnPanel([INSTRUCTORA_AQUI], 'sede-a'), 'app');
  // Instructora en dos sedes: en ninguna gestiona, así que tampoco hay nada que elegir.
  assert.equal(destinoInstructoraEnPanel([INSTRUCTORA_AQUI, { id: 'sede-b', rol: 'INSTRUCTOR' }], 'sede-a'), 'app');
  // Sin rol conocido en la otra sede no se inventa que la gestiona.
  assert.equal(destinoInstructoraEnPanel([INSTRUCTORA_AQUI, { id: 'sede-b', rol: null }], 'sede-a'), 'app');
});

test('si en otra sede gestiona, elige entre la app y cambiar de sede', () => {
  for (const rol of ['PROPIETARIO', 'MANAGER', 'RECEPCION']) {
    assert.equal(destinoInstructoraEnPanel([INSTRUCTORA_AQUI, { id: 'sede-b', rol }], 'sede-a'), 'elegir', rol);
  }
});

test('⚠️ sin confirmación de la BD no se saca a nadie del panel', () => {
  // Si falla la lectura del equipo, el cliente resuelve INSTRUCTOR también para
  // gerencia o recepción: solo `mis_estudios()` puede confirmarlo.
  assert.equal(destinoInstructoraEnPanel([], 'sede-a'), 'sin-confirmar');
  assert.equal(destinoInstructoraEnPanel([{ id: 'sede-b', rol: 'INSTRUCTOR' }], 'sede-a'), 'sin-confirmar');
  for (const rol of ['PROPIETARIO', 'MANAGER', 'RECEPCION', null]) {
    assert.equal(destinoInstructoraEnPanel([{ id: 'sede-a', rol }], 'sede-a'), 'sin-confirmar', String(rol));
  }
});
