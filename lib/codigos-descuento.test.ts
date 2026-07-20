import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generarCodigoReactivacion, sufijoCodigo, calcularDescuento,
  validarCodigoCanjeable, buscarCodigo,
} from './codigos-descuento.ts';
import type { CodigoDescuento } from './types.ts';

function cod(over: Partial<CodigoDescuento> = {}): CodigoDescuento {
  return {
    id: 'c1', studioId: 's1', codigo: 'VUELVE-A3F2', descripcion: 'Reactivación',
    tipo: 'PORCENTAJE', valor: 15, usos: 0, usosMax: 1, expira: '2026-12-31',
    activo: true, creadoEn: '2026-07-20T00:00:00Z', minImporte: null, soloNuevas: false,
    ...over,
  };
}
const HOY = '2026-07-20T10:00:00Z';

test('generarCodigoReactivacion es determinista (misma semilla → mismo código)', () => {
  const a = generarCodigoReactivacion('rec-123');
  const b = generarCodigoReactivacion('rec-123');
  assert.equal(a, b);
  assert.match(a, /^VUELVE-[A-Z2-9]{4}$/);
});

test('semillas distintas dan códigos distintos', () => {
  assert.notEqual(generarCodigoReactivacion('rec-1'), generarCodigoReactivacion('rec-2'));
});

test('el sufijo no usa caracteres ambiguos (O, 0, I, 1)', () => {
  for (const semilla of ['a', 'b', 'rec-xyz', 'zzz', '12345', 'ñ']) {
    assert.doesNotMatch(sufijoCodigo(semilla, 8), /[O0I1]/);
  }
});

test('calcularDescuento: porcentaje e importe fijo, nunca supera el subtotal', () => {
  assert.equal(calcularDescuento(cod({ tipo: 'PORCENTAJE', valor: 15 }), 100), 15);
  assert.equal(calcularDescuento(cod({ tipo: 'IMPORTE_FIJO', valor: 20 }), 100), 20);
  // Un fijo mayor que el ticket no puede dejar el total en negativo.
  assert.equal(calcularDescuento(cod({ tipo: 'IMPORTE_FIJO', valor: 200 }), 50), 50);
});

test('canje válido devuelve el descuento', () => {
  const r = validarCodigoCanjeable(cod(), { hoyISO: HOY, subtotal: 80 });
  assert.deepEqual(r, { ok: true, descuento: 12 }); // 15% de 80
});

test('rechaza código inexistente', () => {
  assert.deepEqual(validarCodigoCanjeable(null, { hoyISO: HOY, subtotal: 50 }), { ok: false, motivo: 'Ese código no existe' });
});

test('rechaza desactivado, caducado y agotado', () => {
  assert.equal(validarCodigoCanjeable(cod({ activo: false }), { hoyISO: HOY, subtotal: 50 }).ok, false);
  assert.equal(validarCodigoCanjeable(cod({ expira: '2026-07-19' }), { hoyISO: HOY, subtotal: 50 }).ok, false);
  assert.equal(validarCodigoCanjeable(cod({ usos: 1, usosMax: 1 }), { hoyISO: HOY, subtotal: 50 }).ok, false);
});

test('caduca el día siguiente, no el mismo día', () => {
  // expira hoy → todavía vale
  assert.equal(validarCodigoCanjeable(cod({ expira: '2026-07-20' }), { hoyISO: HOY, subtotal: 50 }).ok, true);
});

test('respeta el importe mínimo', () => {
  const r = validarCodigoCanjeable(cod({ minImporte: 60 }), { hoyISO: HOY, subtotal: 50 });
  assert.equal(r.ok, false);
  assert.match((r as { motivo: string }).motivo, /mínimo de 60/);
});

test('sin usosMax se puede canjear siempre', () => {
  assert.equal(validarCodigoCanjeable(cod({ usosMax: null, usos: 99 }), { hoyISO: HOY, subtotal: 50 }).ok, true);
});

test('buscarCodigo ignora mayúsculas y espacios', () => {
  const lista = [cod({ codigo: 'VUELVE-A3F2' })];
  assert.ok(buscarCodigo(lista, '  vuelve-a3f2 '));
  assert.equal(buscarCodigo(lista, 'OTRO'), null);
  assert.equal(buscarCodigo(lista, '   '), null);
});
