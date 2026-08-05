import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cumpleContraste } from './wcag-contrast.ts';
import { RETOS_PORTAL, RETO_KEYS, esRetoKeyValida } from './retos-portal.ts';

test('RETOS_PORTAL: 2 retos fijos, calcados del prototipo', () => {
  assert.equal(RETOS_PORTAL.length, 2);
  assert.deepEqual(RETO_KEYS, ['core', 'cara']);
});

test('esRetoKeyValida: solo acepta las keys reales', () => {
  assert.equal(esRetoKeyValida('core'), true);
  assert.equal(esRetoKeyValida('cara'), true);
  assert.equal(esRetoKeyValida('no-existe'), false);
  assert.equal(esRetoKeyValida(''), false);
});

// ── Variante de color (tema Bloom) ──────────────────────────────────────────

// El riesgo real de dar fondo propio a la tarjeta: la tinta deja de poder
// salir de `t.ink` (que en modo noche es casi blanca) y hay que fijarla. Si
// alguien cambia un fondo sin mirar la tinta, esto lo caza aquí y no en el
// móvil de una socia.
test('cada reto trae fondo y tinta con contraste suficiente para leerse', () => {
  for (const r of RETOS_PORTAL) {
    assert.match(r.fondo, /^#[0-9A-F]{6}$/i, `fondo inválido en "${r.key}"`);
    assert.match(r.tinta, /^#[0-9A-F]{6}$/i, `tinta inválida en "${r.key}"`);
    assert.equal(
      cumpleContraste(r.tinta, r.fondo),
      true,
      `el par tinta/fondo de "${r.key}" no cumple contraste`,
    );
  }
});

test('las tres caras son colores válidos y distintos entre sí', () => {
  for (const r of RETOS_PORTAL) {
    assert.equal(r.caras.length, 3);
    for (const c of r.caras) assert.match(c, /^#[0-9A-F]{6}$/i);
    assert.equal(new Set(r.caras).size, 3, `"${r.key}" repite color de cara`);
  }
});

test('los dos retos se distinguen por su fondo (es lo que los separa a la vista)', () => {
  assert.notEqual(RETOS_PORTAL[0].fondo, RETOS_PORTAL[1].fondo);
});
