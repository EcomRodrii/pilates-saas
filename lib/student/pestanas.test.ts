import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esPestanaAlumna, scrollAlVolver } from './pestanas.ts';

test('esPestanaAlumna: las cinco de la barra, y solo su raíz', () => {
  for (const r of ['', '/reservar', '/mis-reservas', '/bonos', '/perfil']) {
    assert.equal(esPestanaAlumna(`/portal/alma${r}`, 'alma'), true, r || 'inicio');
  }
  assert.equal(esPestanaAlumna('/portal/alma/', 'alma'), true);
  assert.equal(esPestanaAlumna('/portal/alma/reservar/c1', 'alma'), false);
  assert.equal(esPestanaAlumna('/portal/alma/perfil/datos', 'alma'), false);
  assert.equal(esPestanaAlumna('/portal/alma/notificaciones', 'alma'), false);
  // Otro estudio no es «la pestaña» de este.
  assert.equal(esPestanaAlumna('/portal/otra/reservar', 'alma'), false);
});

test('scrollAlVolver: donde se dejó, arriba la primera vez, y nada fuera de las pestañas', () => {
  assert.equal(scrollAlVolver(true, 640), 640);
  assert.equal(scrollAlVolver(true, undefined), 0);
  assert.equal(scrollAlVolver(true, -5), 0);
  assert.equal(scrollAlVolver(false, 640), null);
});
