import { test } from 'node:test';
import assert from 'node:assert/strict';

import { filtrarItemsMenu, aplicarLayout } from './layout-runtime.ts';

const ITEMS = [
  { href: '/dashboard' },
  { href: '/calendario' },
  { href: '/citas' },
  { href: '/socios' },
  { href: '/equipo' },
  { href: '/comunidad' },
  { href: '/informes' },
];

// Las seis acciones que el documento de producto exige tener siempre a mano,
// más inicio y ajustes.
const ESENCIALES = ['/dashboard', '/calendario', '/citas', '/socios', '/equipo', '/informes', '/configuracion'];
const TODO_PERMITIDO = () => true;

test('en modo esencial se ven las acciones del día a día', () => {
  const r = filtrarItemsMenu(ITEMS, {
    puedeVer: TODO_PERMITIDO, ocultos: [], modo: 'esencial', esenciales: ESENCIALES,
  }).map(i => i.href);
  // La regresión que motivó el cambio: Citas y Equipo quedaban fuera por
  // defecto pese a ser trabajo diario.
  assert.ok(r.includes('/citas'), 'Citas debe verse en modo esencial');
  assert.ok(r.includes('/equipo'), 'Equipo debe verse en modo esencial');
  assert.ok(!r.includes('/comunidad'), 'Comunidad no es del día a día');
});

test('en modo avanzado se ve todo lo permitido', () => {
  const r = filtrarItemsMenu(ITEMS, {
    puedeVer: TODO_PERMITIDO, ocultos: [], modo: 'avanzado', esenciales: ESENCIALES,
  });
  assert.equal(r.length, ITEMS.length);
});

test('lo que el estudio oculta no aparece, ni siquiera en avanzado', () => {
  const r = filtrarItemsMenu(ITEMS, {
    puedeVer: TODO_PERMITIDO, ocultos: ['/comunidad', '/informes'], modo: 'avanzado', esenciales: ESENCIALES,
  }).map(i => i.href);
  assert.ok(!r.includes('/comunidad'));
  assert.ok(!r.includes('/informes'));
  assert.ok(r.includes('/calendario'));
});

test('el permiso manda: ocultar no puede DEVOLVER lo que el rol prohíbe', () => {
  const r = filtrarItemsMenu(ITEMS, {
    puedeVer: (h) => h !== '/informes', ocultos: [], modo: 'avanzado', esenciales: ESENCIALES,
  }).map(i => i.href);
  assert.ok(!r.includes('/informes'));
});

test('acepta Set o array indistintamente', () => {
  const conSet = filtrarItemsMenu(ITEMS, {
    puedeVer: TODO_PERMITIDO, ocultos: new Set(['/citas']), modo: 'avanzado', esenciales: ESENCIALES,
  });
  const conArray = filtrarItemsMenu(ITEMS, {
    puedeVer: TODO_PERMITIDO, ocultos: ['/citas'], modo: 'avanzado', esenciales: ESENCIALES,
  });
  assert.deepEqual(conSet, conArray);
});

test('NO reordena: el orden de salida es el de entrada', () => {
  const r = filtrarItemsMenu(ITEMS, {
    puedeVer: TODO_PERMITIDO, ocultos: ['/socios'], modo: 'avanzado', esenciales: ESENCIALES,
  }).map(i => i.href);
  assert.deepEqual(r, ['/dashboard', '/calendario', '/citas', '/equipo', '/comunidad', '/informes']);
});

test('aplicarLayout (secciones de la home) sí sigue reordenando', () => {
  // El menú se congela, pero la home del dashboard sigue siendo reordenable:
  // ahí cada estudio mira sus propios números y no hay nada que aprender.
  const r = aplicarLayout(['a', 'b', 'c'], { orden: ['c', 'a'], ocultos: ['b'] });
  assert.deepEqual(r, ['c', 'a']);
});

test('/cobros y /equipo entran en el modo esencial (nueva sección de Cobros)', () => {
  const items = [{ href: '/cobros' }, { href: '/equipo' }, { href: '/productos' }];
  const ESENCIALES = ['/dashboard', '/calendario', '/citas', '/socios', '/equipo', '/cobros', '/informes', '/configuracion'];
  const r = filtrarItemsMenu(items, {
    puedeVer: () => true, ocultos: [], modo: 'esencial', esenciales: ESENCIALES,
  }).map(i => i.href);
  assert.ok(r.includes('/cobros'), 'Cobros debe verse en esencial');
  assert.ok(r.includes('/equipo'), 'Equipo debe verse en esencial');
  assert.ok(!r.includes('/productos'), 'Productos no es esencial');
});
