import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APPS_DE_TIENDA, CATEGORIAS, PESTANAS_INTEGRACION, disponible, esPestanaIntegracion, textoPrecio,
} from './catalogo.ts';
import { ADDONS, LISTA_ADDONS } from '../billing/entitlements.ts';

test('los ids son únicos', () => {
  const ids = APPS_DE_TIENDA.map(a => a.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('toda app tiene una categoría que existe', () => {
  const validas = new Set(CATEGORIAS.map(c => c.id));
  for (const a of APPS_DE_TIENDA) assert.ok(validas.has(a.categoria), `${a.id}: categoría ${a.categoria}`);
});

test('el precio de un complemento sale de ADDONS, no de una copia', () => {
  for (const addon of LISTA_ADDONS) {
    const app = APPS_DE_TIENDA.find(a => a.addon === addon);
    assert.ok(app, `falta el complemento ${addon}`);
    assert.deepEqual(app.precio, { tipo: 'mensual', eur: ADDONS[addon].precioMes });
    assert.equal(app.nombre, ADDONS[addon].nombre);
    assert.equal(app.href, '/suscripcion#complementos');
  }
});

test('cada integración lleva a una pestaña que existe', () => {
  for (const a of APPS_DE_TIENDA.filter(x => x.origen === 'integracion')) {
    assert.ok(a.pestana && esPestanaIntegracion(a.pestana), `${a.id}: pestaña ${a.pestana}`);
    assert.equal(a.href, `/apps/integraciones?pestana=${a.pestana}`);
  }
});

test('las pestañas no se repiten y no ofrecen nada de lo congelado', () => {
  const ids = PESTANAS_INTEGRACION.map(p => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const a of APPS_DE_TIENDA) assert.ok(!/ondemand|\/chat|kiosk/i.test(a.href), `${a.id}: ${a.href}`);
});

test('lo próximamente no se puede activar y el precio lo dice', () => {
  const prox = APPS_DE_TIENDA.filter(a => a.origen === 'proximamente');
  assert.ok(prox.length >= 1);
  for (const a of prox) {
    assert.equal(disponible(a), false);
    assert.equal(textoPrecio(a.precio), 'Próximamente');
  }
});

test('las plataformas se pueden activar hoy en modo manual', () => {
  const plataformas = APPS_DE_TIENDA.filter(a => a.plataforma);
  assert.deepEqual(plataformas.map(a => a.plataforma).sort(), ['CLASSPASS', 'URBAN_SPORTS_CLUB', 'WELLHUB']);
  for (const a of plataformas) assert.equal(disponible(a), true);
});

test('el texto del precio', () => {
  assert.equal(textoPrecio({ tipo: 'incluida' }), 'Incluida');
  assert.equal(textoPrecio({ tipo: 'mensual', eur: 9 }), '9 €/mes');
  assert.equal(textoPrecio({ tipo: 'proximamente' }), 'Próximamente');
});
