// Tests del cálculo de nivel por créditos. Runner nativo de Node: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LevelDefinition } from '@/lib/types';
import { calcularNivel } from './level-engine.ts';

function nivel(orden: number, umbralCreditos: number, activo = true): LevelDefinition {
  return {
    id: `lvl-${orden}`, studioId: 'e1', nombre: `N${orden}`, orden, umbralCreditos,
    color: '#000', icono: '⭐', beneficios: null, activo, creadoEn: '2026-01-01',
  };
}
const niveles = [nivel(1, 0), nivel(2, 100), nivel(3, 300)];

test('con 0 créditos → nivel base, siguiente es el segundo', () => {
  const r = calcularNivel(niveles, 0);
  assert.equal(r.actual?.orden, 1);
  assert.equal(r.siguiente?.orden, 2);
  assert.equal(r.creditosParaSiguiente, 100);
});

test('progreso intermedio hacia el siguiente nivel', () => {
  const r = calcularNivel(niveles, 150); // entre 100 y 300
  assert.equal(r.actual?.orden, 2);
  assert.equal(r.siguiente?.orden, 3);
  // (150-100)/(300-100) = 0.25
  assert.equal(r.progreso, 0.25);
  assert.equal(r.creditosParaSiguiente, 150);
});

test('en el nivel máximo → sin siguiente, progreso 1', () => {
  const r = calcularNivel(niveles, 500);
  assert.equal(r.actual?.orden, 3);
  assert.equal(r.siguiente, null);
  assert.equal(r.progreso, 1);
  assert.equal(r.creditosParaSiguiente, null);
});

test('ignora niveles inactivos', () => {
  const conInactivo = [nivel(1, 0), nivel(2, 100, false), nivel(3, 300)];
  const r = calcularNivel(conInactivo, 150);
  // el nivel 2 está inactivo → actual sigue siendo el 1, siguiente el 3
  assert.equal(r.actual?.orden, 1);
  assert.equal(r.siguiente?.orden, 3);
});
