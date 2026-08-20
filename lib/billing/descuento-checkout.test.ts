import test from 'node:test';
import assert from 'node:assert/strict';
import type { CodigoDescuento } from '../types.ts';
import { resolverDescuentoCheckout } from './descuento-checkout.ts';

const HOY = '2026-08-20';

function codigo(p: Partial<CodigoDescuento> & Pick<CodigoDescuento, 'codigo'>): CodigoDescuento {
  return {
    id: `c-${p.codigo}`, studioId: 'e1', descripcion: '', tipo: 'PORCENTAJE', valor: 10,
    usos: 0, usosMax: null, expira: null, activo: true, creadoEn: HOY, ...p,
  };
}

test('código inexistente no cumple', () => {
  const r = resolverDescuentoCheckout([], 'NOEXISTE', { hoyISO: HOY, subtotal: 50, esNueva: true });
  assert.equal(r.ok, false);
});

test('código válido sin soloNuevas se canjea igual para socia existente', () => {
  const c = codigo({ codigo: 'VERANO10' });
  const r = resolverDescuentoCheckout([c], 'verano10', { hoyISO: HOY, subtotal: 50, esNueva: false });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.descuento, 5);
});

// Regresión del hueco encontrado en el diseño: soloNuevas nunca se comprobaba.
test('soloNuevas: rechaza a una socia ya existente', () => {
  const c = codigo({ codigo: 'BIENVENIDA', soloNuevas: true });
  const r = resolverDescuentoCheckout([c], 'BIENVENIDA', { hoyISO: HOY, subtotal: 50, esNueva: false });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.motivo, /nuevas/i);
});

test('soloNuevas: acepta a una invitada nueva', () => {
  const c = codigo({ codigo: 'BIENVENIDA', soloNuevas: true });
  const r = resolverDescuentoCheckout([c], 'BIENVENIDA', { hoyISO: HOY, subtotal: 50, esNueva: true });
  assert.equal(r.ok, true);
});

test('código caducado no cumple aunque soloNuevas pase', () => {
  const c = codigo({ codigo: 'VIEJO', soloNuevas: true, expira: '2026-01-01' });
  const r = resolverDescuentoCheckout([c], 'VIEJO', { hoyISO: HOY, subtotal: 50, esNueva: true });
  assert.equal(r.ok, false);
});

test('búsqueda del código ignora mayúsculas y espacios', () => {
  const c = codigo({ codigo: 'AMIGAS20' });
  const r = resolverDescuentoCheckout([c], '  amigas20  ', { hoyISO: HOY, subtotal: 100, esNueva: true });
  assert.equal(r.ok, true);
});
