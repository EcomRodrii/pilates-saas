import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hexToHsl, hslToHex, ajustarLuminosidad, derivarPaleta } from './color-utils.ts';
import { cumpleContraste } from './wcag-contrast.ts';

test('hexToHsl: negro/blanco/rojo puro', () => {
  assert.deepEqual(hexToHsl('#000000'), { h: 0, s: 0, l: 0 });
  assert.deepEqual(hexToHsl('#FFFFFF'), { h: 0, s: 0, l: 100 });
  const rojo = hexToHsl('#FF0000')!;
  assert.equal(Math.round(rojo.h), 0);
  assert.equal(Math.round(rojo.s), 100);
  assert.equal(Math.round(rojo.l), 50);
});

test('hexToHsl → hslToHex es reversible (aprox)', () => {
  for (const hex of ['#4F46E5', '#0F766E', '#C2410C', '#FFC8E2']) {
    const back = hslToHex(hexToHsl(hex)!);
    assert.equal(back, hex.toUpperCase());
  }
});

test('hslToHex normaliza valores fuera de rango', () => {
  assert.equal(hslToHex({ h: 400, s: 150, l: -10 }), '#000000');
  assert.equal(hslToHex({ h: -60, s: 0, l: 120 }), '#FFFFFF');
});

test('ajustarLuminosidad aclara y oscurece', () => {
  const claro = ajustarLuminosidad('#808080', 20);
  const oscuro = ajustarLuminosidad('#808080', -20);
  assert.ok(hexToHsl(claro)!.l > hexToHsl('#808080')!.l);
  assert.ok(hexToHsl(oscuro)!.l < hexToHsl('#808080')!.l);
});

test('ajustarLuminosidad: hex inválido se devuelve tal cual', () => {
  assert.equal(ajustarLuminosidad('nope', 10), 'nope');
});

test('derivarPaleta: devuelve hex válidos', () => {
  const p = derivarPaleta('#4F46E5');
  for (const c of [p.secondary, p.accent, p.background, p.text]) {
    assert.match(c, /^#[0-9A-F]{6}$/);
  }
});

test('derivarPaleta: fondo claro, texto oscuro, acento claro', () => {
  const p = derivarPaleta('#0F766E');
  assert.ok(hexToHsl(p.background)!.l > 90, 'fondo casi blanco');
  assert.ok(hexToHsl(p.text)!.l < 20, 'texto casi negro');
  assert.ok(hexToHsl(p.accent)!.l > 88, 'acento claro');
});

test('derivarPaleta: texto/fondo cumplen WCAG AA', () => {
  for (const marca of ['#4F46E5', '#0F766E', '#C2410C', '#7F1D1D', '#FFC8E2']) {
    const p = derivarPaleta(marca);
    assert.equal(cumpleContraste(p.text, p.background), true, `contraste falla para ${marca}`);
  }
});

test('derivarPaleta: marca inválida → paleta por defecto', () => {
  assert.deepEqual(derivarPaleta('basura'), {
    secondary: '#B57A8E',
    accent: '#FFF2F7',
    background: '#EEEEE8',
    text: '#1A1A1A',
  });
});
