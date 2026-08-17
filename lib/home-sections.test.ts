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

// ── Prioridad del asistente de bienvenida (§8) ───────────────────────────────

test('la prioridad "Cobros" sube ingresos justo detrás de las fijas', () => {
  const visibles = ['accion', 'onboarding', 'resumen', 'ingresos', 'principal'];
  assert.deepEqual(
    ordenarSeccionesHome(visibles, ['Cobros']),
    ['accion', 'onboarding', 'ingresos', 'resumen', 'principal'],
  );
});

test('dos prioridades respetan el orden en que se eligieron', () => {
  const visibles = ['accion', 'resumen', 'ingresos', 'principal', 'automatizaciones'];
  assert.deepEqual(
    ordenarSeccionesHome(visibles, ['Gestionar reservas', 'Cobros']),
    ['accion', 'principal', 'ingresos', 'resumen', 'automatizaciones'],
  );
});

test('las fijas siguen mandando: la prioridad no entierra accion/onboarding', () => {
  const visibles = ['resumen', 'ingresos', 'accion', 'onboarding'];
  const r = ordenarSeccionesHome(visibles, ['Cobros']);
  assert.deepEqual(r.slice(0, 2), ['accion', 'onboarding']);
  assert.equal(r[2], 'ingresos');
});

test('una prioridad sin sección real no mueve nada', () => {
  // 'Conseguir más alumnos', 'Marketing' y 'Sustituciones' no tienen hoy una
  // sección de la home que las atienda. Mapearlas a la "más parecida" movería
  // el panel por un motivo inventado; el orden se queda como estaba.
  const visibles = ['accion', 'resumen', 'ingresos', 'principal'];
  for (const p of ['Conseguir más alumnos', 'Marketing', 'Sustituciones de profesoras', 'Otro']) {
    assert.deepEqual(ordenarSeccionesHome(visibles, [p]), ordenarSeccionesHome(visibles), p);
  }
});

test('sin prioridad el comportamiento es exactamente el de antes', () => {
  const visibles = ['resumen', 'onboarding', 'ingresos'];
  const base = ordenarSeccionesHome(visibles);
  assert.deepEqual(ordenarSeccionesHome(visibles, null), base);
  assert.deepEqual(ordenarSeccionesHome(visibles, []), base);
  assert.deepEqual(ordenarSeccionesHome(visibles, undefined), base);
});

test('una prioridad cuya sección está OCULTA no la resucita', () => {
  // `visibles` ya viene filtrado por lo que el estudio decidió mostrar: subir
  // una sección que él ocultó sería pisar su decisión.
  const visibles = ['accion', 'resumen'];
  assert.deepEqual(ordenarSeccionesHome(visibles, ['Cobros']), ['accion', 'resumen']);
});

test('no se pierde ni se duplica ninguna sección al reordenar', () => {
  const visibles = ['accion', 'onboarding', 'resumen', 'ingresos', 'principal', 'automatizaciones'];
  const r = ordenarSeccionesHome(visibles, ['Cobros', 'Automatizar tareas', 'Gestionar reservas']);
  assert.equal(r.length, visibles.length);
  assert.deepEqual([...r].sort(), [...visibles].sort());
});
