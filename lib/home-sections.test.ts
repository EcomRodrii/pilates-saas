import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ordenarSeccionesHome, HOME_FIJAS_PRIMERO } from './home-sections.ts';

test('ordenarSeccionesHome: onboarding va primero aunque el orden guardado lo entierre', () => {
  // El caso real detectado en producción: un orden guardado antes de que
  // 'onboarding' tuviera lógica lo dejó en la posición 5 de 7.
  const visibles = ['ingresos', 'kpis', 'graficos', 'principal', 'onboarding', 'automatizaciones', 'resumen'];
  assert.deepEqual(
    ordenarSeccionesHome(visibles),
    ['onboarding', 'ingresos', 'kpis', 'graficos', 'principal', 'automatizaciones', 'resumen'],
  );
});

test('ordenarSeccionesHome: sin onboarding en la lista, no cambia nada', () => {
  const visibles = ['resumen', 'kpis', 'principal'];
  assert.deepEqual(ordenarSeccionesHome(visibles), visibles);
});

test('ordenarSeccionesHome: si onboarding está oculto (no en visibles), no aparece de la nada', () => {
  const visibles = ['resumen', 'principal'];
  const r = ordenarSeccionesHome(visibles);
  assert.ok(!r.includes('onboarding'));
  assert.deepEqual(r, visibles);
});

test('ordenarSeccionesHome: estudio nuevo sin personalizar ya sale en el orden correcto', () => {
  const visibles = ['onboarding', 'resumen', 'automatizaciones', 'ingresos', 'kpis', 'graficos', 'principal'];
  assert.deepEqual(ordenarSeccionesHome(visibles), visibles);
});

test('HOME_FIJAS_PRIMERO contiene onboarding', () => {
  assert.ok(HOME_FIJAS_PRIMERO.includes('onboarding'));
});
