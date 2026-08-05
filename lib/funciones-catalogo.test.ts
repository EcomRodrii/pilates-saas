import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calcularCatalogoFunciones } from './funciones-catalogo.ts';
import { RUTAS_CONGELADAS } from './frozen-features.ts';

test('nunca enseña un módulo congelado', () => {
  const todas = calcularCatalogoFunciones().flatMap(c => c.funciones);
  for (const f of todas) {
    assert.ok(!RUTAS_CONGELADAS.some(p => f.href === p || f.href.startsWith(`${p}/`)), `${f.href} está congelado y no debería aparecer`);
  }
});

test('nunca enseña el módulo de marketing (flag desactivado)', () => {
  const todas = calcularCatalogoFunciones().flatMap(c => c.funciones);
  assert.ok(!todas.some(f => f.href === '/marketing' || f.href.startsWith('/contenido')));
});

test('toda función tiene descripción y ninguna categoría queda vacía', () => {
  const categorias = calcularCatalogoFunciones();
  assert.ok(categorias.length > 0);
  for (const cat of categorias) {
    assert.ok(cat.funciones.length > 0, `categoría ${cat.id} vacía`);
    for (const f of cat.funciones) assert.ok(f.descripcion.length > 0, `${f.href} sin descripción`);
  }
});

test('cubre módulos que no aparecen en el onboarding de Fase 1 (sustituciones, informes, cierre)', () => {
  const hrefs = calcularCatalogoFunciones().flatMap(c => c.funciones).map(f => f.href);
  assert.ok(hrefs.includes('/sustituciones'));
  assert.ok(hrefs.includes('/informes'));
  assert.ok(hrefs.includes('/cierre'));
});
