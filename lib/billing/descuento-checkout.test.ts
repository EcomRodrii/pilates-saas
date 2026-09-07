import test from 'node:test';
import assert from 'node:assert/strict';
import type { CodigoDescuento } from '../types.ts';
import { resolverDescuentoCheckout } from './descuento-checkout.ts';

const HOY = '2026-08-20';
const SIN_USOS: ReadonlySet<string> = new Set();

function codigo(p: Partial<CodigoDescuento> & Pick<CodigoDescuento, 'codigo'>): CodigoDescuento {
  return {
    id: `c-${p.codigo}`, studioId: 'e1', descripcion: '', tipo: 'PORCENTAJE', valor: 10,
    usos: 0, usosMax: null, expira: null, activo: true, creadoEn: HOY, ...p,
  };
}

test('código inexistente no cumple', () => {
  const r = resolverDescuentoCheckout([], 'NOEXISTE', { hoyISO: HOY, subtotal: 50, esNueva: true, codigosYaUsados: SIN_USOS });
  assert.equal(r.ok, false);
});

test('código válido sin soloNuevas se canjea igual para socia existente', () => {
  const c = codigo({ codigo: 'VERANO10' });
  const r = resolverDescuentoCheckout([c], 'verano10', { hoyISO: HOY, subtotal: 50, esNueva: false, codigosYaUsados: SIN_USOS });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.descuento, 5);
});

// Regresión del hueco encontrado en el diseño: soloNuevas nunca se comprobaba.
test('soloNuevas: rechaza a una socia ya existente', () => {
  const c = codigo({ codigo: 'BIENVENIDA', soloNuevas: true });
  const r = resolverDescuentoCheckout([c], 'BIENVENIDA', { hoyISO: HOY, subtotal: 50, esNueva: false, codigosYaUsados: SIN_USOS });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.motivo, /nuevas/i);
});

test('soloNuevas: acepta a una invitada nueva', () => {
  const c = codigo({ codigo: 'BIENVENIDA', soloNuevas: true });
  const r = resolverDescuentoCheckout([c], 'BIENVENIDA', { hoyISO: HOY, subtotal: 50, esNueva: true, codigosYaUsados: SIN_USOS });
  assert.equal(r.ok, true);
});

test('código caducado no cumple aunque soloNuevas pase', () => {
  const c = codigo({ codigo: 'VIEJO', soloNuevas: true, expira: '2026-01-01' });
  const r = resolverDescuentoCheckout([c], 'VIEJO', { hoyISO: HOY, subtotal: 50, esNueva: true, codigosYaUsados: SIN_USOS });
  assert.equal(r.ok, false);
});

test('búsqueda del código ignora mayúsculas y espacios', () => {
  const c = codigo({ codigo: 'AMIGAS20' });
  const r = resolverDescuentoCheckout([c], '  amigas20  ', { hoyISO: HOY, subtotal: 100, esNueva: true, codigosYaUsados: SIN_USOS });
  assert.equal(r.ok, true);
});

// ── P-5 (auditoría 26ª pasada): una vez por socia, tenga o no usosMax ───────

test('P-5: esta socia ya usó este código (aunque no tenga usosMax) → rechazado', () => {
  const c = codigo({ codigo: 'AMIGAS20', usosMax: null });
  const r = resolverDescuentoCheckout([c], 'AMIGAS20', {
    hoyISO: HOY, subtotal: 50, esNueva: false, codigosYaUsados: new Set([c.id]),
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.motivo, /ya has usado/i);
});

test('P-5: el mismo código lo puede usar OTRA socia sin problema', () => {
  const c = codigo({ codigo: 'AMIGAS20', usosMax: null });
  // `codigosYaUsados` trae OTRO id de código, no el de este — como si esta
  // socia hubiera usado un código distinto, nunca este.
  const r = resolverDescuentoCheckout([c], 'AMIGAS20', {
    hoyISO: HOY, subtotal: 50, esNueva: false, codigosYaUsados: new Set(['c-OTRO']),
  });
  assert.equal(r.ok, true);
});

test('P-5: una invitada sin socioId (codigosYaUsados vacío) no se bloquea aquí', () => {
  // El cierre real para la invitada vive en el UNIQUE de BD al consumir, no en
  // esta comprobación previa — ver lib/billing/codigos-ya-usados.ts.
  const c = codigo({ codigo: 'AMIGAS20', usosMax: null });
  const r = resolverDescuentoCheckout([c], 'AMIGAS20', { hoyISO: HOY, subtotal: 50, esNueva: true, codigosYaUsados: SIN_USOS });
  assert.equal(r.ok, true);
});
